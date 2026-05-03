import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { ImapFlow } from 'imapflow'
import { sendDiscordNotification } from '@/lib/discord'

const BASE  = 'appCYgmFc8vTfwyv1'
const TABLE = 'tblAsQXKEK9chUaT6'
const AT    = () => process.env.AIRTABLE_API_KEY!

async function appendToSent(user: string, pass: string, raw: string) {
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user, pass }, logger: false,
    tls: { rejectUnauthorized: false },
  })
  try {
    await client.connect()
    await client.append('[Gmail]/Sent Mail', raw, ['\\Seen'])
    await client.logout()
  } catch (e: any) {
    console.error('IMAP append error:', e.message)
    try { await client.logout() } catch {}
  }
}

export async function POST(req: NextRequest) {
  const { recordId, to, subject, body, inReplyToSubject, company } = await req.json()

  const from = process.env.SMTP_EMAIL!
  const pass = process.env.SMTP_PASSWORD!
  if (!from || !pass) return NextResponse.json({ ok: false, error: 'SMTP not configured' }, { status: 400 })
  if (!to || !body)   return NextResponse.json({ ok: false, error: 'Missing to or body' }, { status: 400 })

  const replySubject = inReplyToSubject
    ? (inReplyToSubject.startsWith('Re:') ? inReplyToSubject : `Re: ${inReplyToSubject}`)
    : subject || 'Re: Your message'

  const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;max-width:600px">
${body.replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>').replace(/^/,'<p>').replace(/$/,'</p>')}
</div>`

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 587, secure: false,
    auth: { user: from, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000, socketTimeout: 15000,
  })

  try {
    await transporter.verify()
    const info = await transporter.sendMail({
      from:    `Brandon @ TradeCafe <${from}>`,
      to,
      subject: replySubject,
      text:    body,
      html:    htmlBody,
    })
    transporter.close()

    // Save to Sent folder
    const rawMsg = [
      `From: Brandon @ TradeCafe <${from}>`,
      `To: ${to}`,
      `Subject: ${replySubject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: ${info.messageId}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      body,
    ].join('\r\n')
    appendToSent(from, pass, rawMsg).catch(() => {})

    // Update Airtable: mark reply sent, update status
    if (recordId) {
      await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}/${recordId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${AT()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            'Reply Sent':    true,
            'Status':        'Replied',
            'Last Contacted': new Date().toISOString().split('T')[0],
          },
          typecast: true,
        }),
      })
    }

    // Notify Discord that a reply was sent
    sendDiscordNotification({
      type:    'reply_sent',
      company: company || to,
      email:   to,
    }).catch(() => {})

    return NextResponse.json({ ok: true, messageId: info.messageId })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

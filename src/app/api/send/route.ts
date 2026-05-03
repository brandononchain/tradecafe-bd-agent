import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { ImapFlow } from 'imapflow'

const BASE  = 'appCYgmFc8vTfwyv1'
const TABLE = 'tblAsQXKEK9chUaT6'
const AT    = () => process.env.AIRTABLE_API_KEY!

function validateEmail(email: string): { valid: boolean; reason?: string; warning?: string } {
  if (!email || !email.includes('@')) return { valid: false, reason: 'Invalid email format' }
  const [prefix, domain] = email.toLowerCase().split('@')
  if (!domain) return { valid: false, reason: 'Invalid email format' }
  const personal = ['gmail.com','yahoo.com','hotmail.com','outlook.com','live.com','icloud.com','me.com','mac.com','hey.com','proton.me','protonmail.com','fastmail.com','aol.com','msn.com']
  if (personal.includes(domain))   return { valid: false, reason: `Personal email (${domain})` }
  if (domain.endsWith('.edu'))      return { valid: false, reason: `Education email` }
  const roles = ['hello','info','contact','support','admin','noreply','no-reply','team','sales','marketing']
  if (roles.includes(prefix))       return { valid: true, warning: `Role-based address (${prefix}@)` }
  return { valid: true }
}

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

// Mark lead as bounced in Airtable
async function markBounced(recordId: string, reason: string) {
  if (!recordId) return
  await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}/${recordId}`, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${AT()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        'Bounced':      true,
        'Bounce Reason': reason.slice(0, 200),
        'Status':       'New',
        'Sequence Status': 'Cold',
      },
      typecast: true,
    }),
  }).catch(() => {})
}

export async function POST(req: NextRequest) {
  const { to, subject, body, fromName, fromEmail, smtpPass, validate, recordId } = await req.json()

  if (validate) {
    const result = validateEmail(to)
    return NextResponse.json({ ok: true, ...result })
  }

  const pass = smtpPass || process.env.SMTP_PASSWORD
  const from = fromEmail || process.env.SMTP_EMAIL
  const name = fromName  || process.env.SMTP_NAME || 'Brandon @ TradeCafe'

  if (!pass || !from)        return NextResponse.json({ ok: false, error: 'SMTP not configured' }, { status: 400 })
  if (!to || !subject || !body) return NextResponse.json({ ok: false, error: 'Missing to, subject, or body' }, { status: 400 })

  const validation = validateEmail(to)
  if (!validation.valid) return NextResponse.json({ ok: false, error: `Email blocked: ${validation.reason}`, blocked: true }, { status: 400 })

  // Build tracking pixel URL (only if we have a recordId)
  const appUrl    = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://tradecafe-bd.vercel.app'
  const pixelHtml = recordId
    ? `<img src="${appUrl}/api/track/${recordId}" width="1" height="1" style="display:none" alt="" />`
    : ''

  const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;max-width:600px">
${body.replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>').replace(/^/,'<p>').replace(/$/,'</p>')}
<p style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#999">
  To unsubscribe, reply with "unsubscribe".
</p>${pixelHtml}</div>`

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 587, secure: false,
    auth: { user: from, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 15000,
  })

  try {
    await transporter.verify()

    const info = await transporter.sendMail({
      from:    `${name} <${from}>`,
      to,
      subject,
      text:    body + '\n\n---\nTo unsubscribe, reply with "unsubscribe".',
      html:    htmlBody,
      headers: {
        'List-Unsubscribe': `<mailto:${from}?subject=unsubscribe>`,
        'Precedence': 'bulk',
      },
      date: new Date(),
    })
    transporter.close()

    // Save to IMAP Sent folder async
    const rawMsg = [
      `From: ${name} <${from}>`, `To: ${to}`, `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`, `Message-ID: ${info.messageId}`,
      `MIME-Version: 1.0`, `Content-Type: text/plain; charset=UTF-8`, ``,
      body + '\n\nTo unsubscribe, reply with "unsubscribe".',
    ].join('\r\n')
    appendToSent(from, pass, rawMsg).catch(() => {})

    return NextResponse.json({ ok: true, messageId: info.messageId, warning: validation.warning || null })
  } catch (e: any) {
    const msg = e.message || ''

    // SMTP hard bounce detection — permanent failures (5xx)
    const isBounce = /55[0-4]|user.?unknown|no.?such.?user|invalid.?recipient|does.?not.?exist|mailbox.?not.?found|address.?rejected|not.?a.?valid|undeliverable|account.?does.?not|bad.?destination/i.test(msg)

    let userError = msg
    if (isBounce)                                      userError = `Bounced: email address does not exist (${to})`
    else if (/535|auth/i.test(msg))                    userError = `SMTP auth failed — check credentials`
    else if (/timeout|ECONNREFUSED/i.test(msg))        userError = `SMTP connection failed`
    else if (/554|spam|JFE/i.test(msg))                userError = `Blocked by spam filter — reduce send volume`

    if (isBounce && recordId) {
      markBounced(recordId, userError).catch(() => {})
    }

    return NextResponse.json({ ok: false, error: userError, bounced: isBounce }, { status: 500 })
  }
}

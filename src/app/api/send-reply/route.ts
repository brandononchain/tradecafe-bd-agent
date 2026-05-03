import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/gmail'

const BASE  = 'appCYgmFc8vTfwyv1'
const TABLE = 'tblAsQXKEK9chUaT6'

export async function POST(req: NextRequest) {
  const { to, subject, body, recordId, threadId, originalMessageId } = await req.json()
  const from = process.env.SMTP_EMAIL || 'brandon@tradecafe.ai'
  const name = process.env.SMTP_NAME || 'Brandon @ TradeCafe'

  if (!to || !body) return NextResponse.json({ ok: false, error: 'Missing to or body' }, { status: 400 })

  try {
    const result = await sendEmail({
      to,
      subject: subject || 'Re: ',
      body,
      fromName: name,
      fromEmail: from,
      replyToMessageId: originalMessageId,
      threadId,
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    }

    // Mark reply sent in Airtable
    if (recordId) {
      await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}/${recordId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { 'Reply Sent': true }, typecast: true }),
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, messageId: result.messageId })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

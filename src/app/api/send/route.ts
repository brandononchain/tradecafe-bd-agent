import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, verifyGmail } from '@/lib/gmail'

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

async function markBounced(recordId: string, reason: string) {
  if (!recordId) return
  await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}/${recordId}`, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${AT()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: { 'Bounced': true, 'Bounce Reason': reason.slice(0, 200), 'Status': 'New', 'Sequence Status': 'Cold' },
      typecast: true,
    }),
  }).catch(() => {})
}

export async function POST(req: NextRequest) {
  const { to, subject, body, fromName, fromEmail, validate, recordId } = await req.json()

  if (validate) {
    const result = validateEmail(to)
    return NextResponse.json({ ok: true, ...result })
  }

  if (!to || !subject || !body) return NextResponse.json({ ok: false, error: 'Missing to, subject, or body' }, { status: 400 })

  const validation = validateEmail(to)
  if (!validation.valid) return NextResponse.json({ ok: false, error: `Email blocked: ${validation.reason}`, blocked: true }, { status: 400 })

  try {
    const result = await sendEmail({
      to, subject, body,
      fromName: fromName || process.env.SMTP_NAME || 'Brandon @ TradeCafe',
      fromEmail: fromEmail || process.env.SMTP_EMAIL || 'brandon@tradecafe.ai',
    })

    if (!result.ok) {
      const isBounce = /invalid|not found|does not exist/i.test(result.error || '')
      if (isBounce && recordId) markBounced(recordId, result.error || '').catch(() => {})
      return NextResponse.json({ ok: false, error: result.error, bounced: isBounce }, { status: 500 })
    }

    return NextResponse.json({ ok: true, messageId: result.messageId, warning: validation.warning || null })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

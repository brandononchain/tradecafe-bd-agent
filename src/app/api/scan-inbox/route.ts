import { NextRequest, NextResponse } from 'next/server'
import { listInbox } from '@/lib/gmail'

const BASE  = 'appCYgmFc8vTfwyv1'
const LEADS = `https://api.airtable.com/v0/${BASE}/tblAsQXKEK9chUaT6`
const LOG   = `https://api.airtable.com/v0/${BASE}/tbli5CIBIqRXIkRqe`
const AT    = () => process.env.AIRTABLE_API_KEY!

async function classifyReply(text: string, company: string) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 400,
        system: 'Classify B2B sales email replies. Respond ONLY with valid JSON.',
        messages: [{ role: 'user', content: `Classify reply to cold outreach from ${company}:\n\n"${text.slice(0, 800)}"\n\nIntent: "interested"|"unsubscribe"|"not_now"|"question"|"other"\n\nJSON: {"intent":"...","summary":"one sentence","suggestedResponse":"2-3 sentences, never start with I"}` }],
      }),
      signal: AbortSignal.timeout(12000),
    })
    const d = await res.json()
    const raw = d.content?.[0]?.text || ''
    const match = raw.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
  } catch {}
  return { intent: 'other', summary: 'Reply received', suggestedResponse: '' }
}

export async function POST(req: NextRequest) {
  const { days = 45 } = await req.json().catch(() => ({}))
  const now = new Date()

  try {
    // Load leads from Airtable
    let offset: string | undefined
    const leads: any[] = []
    do {
      const data = await fetch(
        `${LEADS}?pageSize=100${offset ? `&offset=${offset}` : ''}`,
        { headers: { Authorization: `Bearer ${AT()}` }, next: { revalidate: 0 } }
      ).then(r => r.json())
      leads.push(...(data.records || []))
      offset = data.offset
    } while (offset)

    const contactEmails = new Set<string>()
    const emailToRecord = new Map<string, any>()
    for (const r of leads) {
      const email = r.fields['Contact Email']?.toLowerCase()
      const seq = r.fields['Sequence Status'] || 'Cold'
      if (email && !['Cold', 'Opted Out'].includes(seq)) {
        contactEmails.add(email)
        emailToRecord.set(email, r)
      }
    }

    // Fetch inbox via Gmail API
    const sinceDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
    const { messages, error } = await listInbox({ query: 'in:inbox', afterDate: sinceDate, maxResults: 100 })
    if (error) return NextResponse.json({ ok: false, error }, { status: 500 })

    const processed: any[] = []
    let newReplies = 0

    for (const msg of messages) {
      const fromEmail = (msg.fromEmail || '').toLowerCase()
      const fromDomain = fromEmail.split('@')[1] || ''

      // Skip bounces/system mail
      if (/mailer-daemon|postmaster|delivery/i.test(fromEmail)) continue

      // Match against CRM
      let matchedEmail = contactEmails.has(fromEmail) ? fromEmail : null
      if (!matchedEmail) {
        // Domain fuzzy match
        const ceArray = Array.from(contactEmails)
        for (const ce of ceArray) {
          if (ce.split('@')[1] === fromDomain) { matchedEmail = ce; break }
        }
      }
      if (!matchedEmail) continue

      const r = emailToRecord.get(matchedEmail)
      if (!r || r.fields['Reply Text']) continue // already processed

      const company = r.fields['Company'] || matchedEmail
      const classification = await classifyReply(msg.body || msg.snippet, company)

      const statusMap: Record<string, string> = {
        interested: 'Replied', unsubscribe: 'Opted Out',
        not_now: 'Replied', question: 'Replied', other: 'Replied',
      }

      await fetch(`${LEADS}/${r.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${AT()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            'Status': statusMap[classification.intent] || 'Replied',
            'Sequence Status': statusMap[classification.intent] || 'Replied',
            'Reply Text': (msg.body || msg.snippet).slice(0, 5000),
            'Reply Date': now.toISOString().split('T')[0],
            'Reply Intent': classification.intent,
            'Suggested Reply': classification.suggestedResponse,
          },
          typecast: true,
        }),
      })

      processed.push({ type: 'reply', company, email: matchedEmail, intent: classification.intent, preview: (msg.body || msg.snippet).slice(0, 120) })
      newReplies++
    }

    return NextResponse.json({ ok: true, scanned: messages.length, found: processed.length, newReplies, details: processed })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: 'Use POST' }, { status: 405 })
}

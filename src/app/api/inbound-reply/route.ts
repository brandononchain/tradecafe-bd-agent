import { NextRequest, NextResponse } from 'next/server'

const BASE  = 'appCYgmFc8vTfwyv1'
const LEADS = 'tblAsQXKEK9chUaT6'
const AT    = () => process.env.AIRTABLE_API_KEY!

// Classify what kind of reply this is
async function classifyReply(replyText: string, company: string): Promise<{
  intent: 'interested' | 'unsubscribe' | 'not_now' | 'question' | 'other'
  summary: string
  suggestedResponse: string
}> {
  const prompt = `You received a reply to a cold outreach email from ${company}.

Reply text:
"""
${replyText.slice(0, 1500)}
"""

Classify this reply and draft a response.

Intent options:
- "interested" — they want to learn more, book a call, see a demo
- "unsubscribe" — they want to be removed, "not interested", "remove me", "stop emailing"
- "not_now" — they like it but timing is off ("maybe next quarter", "we're heads down", "too busy right now")
- "question" — they have a specific question about the product
- "other" — anything else

Return ONLY valid JSON:
{
  "intent": "...",
  "summary": "One sentence summary of what they said",
  "suggestedResponse": "A warm, short 2-3 sentence reply. If interested: confirm next step and offer two specific times. If not_now: thank them, ask if you can check back in [their timeframe]. If question: answer it directly. If unsubscribe: polite acknowledgement only, no sales. Never start with 'I'."
}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: 'You classify B2B sales replies and draft responses. Respond ONLY with valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  const raw = data.content?.[0]?.text || ''
  const match = raw.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON from Claude')
  return JSON.parse(match[0])
}

async function findLeadByEmail(email: string): Promise<any | null> {
  // Search Airtable for a lead with this contact email
  const encoded = encodeURIComponent(`{Contact Email}="${email}"`)
  const r = await fetch(
    `https://api.airtable.com/v0/${BASE}/${LEADS}?filterByFormula=${encoded}&pageSize=1`,
    { headers: { Authorization: `Bearer ${AT()}` } }
  )
  if (!r.ok) return null
  const d = await r.json()
  return d.records?.[0] || null
}

async function updateLeadReply(recordId: string, intent: string, summary: string, suggestedResponse: string) {
  const statusMap: Record<string, string> = {
    interested:  'Replied',
    unsubscribe: 'Opted Out',
    not_now:     'Replied',
    question:    'Replied',
    other:       'Replied',
  }
  await fetch(`https://api.airtable.com/v0/${BASE}/${LEADS}/${recordId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${AT()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        'Status':          statusMap[intent] || 'Replied',
        'Sequence Status': statusMap[intent] || 'Replied',
        'Last Contacted':  new Date().toISOString().split('T')[0],
        'Personalization Notes': `[REPLY ${new Date().toLocaleDateString()}] ${summary}\n\nSuggested response:\n${suggestedResponse}`,
      },
      typecast: true,
    }),
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
      || Object.fromEntries(new URLSearchParams(await req.text()))

    // Extract fields from SendGrid/Postmark/generic inbound webhook
    const fromEmail: string = (
      body.from || body.From || body.sender || ''
    ).replace(/.*<(.+)>/, '$1').trim().toLowerCase()

    const subject: string  = body.subject || body.Subject || ''
    const textBody: string = body.text    || body.TextBody || body['body-plain'] || ''
    const htmlBody: string = body.html    || body.HtmlBody || body['body-html']  || ''
    const replyText = textBody || htmlBody.replace(/<[^>]+>/g, ' ')

    if (!fromEmail || !replyText) {
      return NextResponse.json({ ok: false, error: 'Missing from or body' }, { status: 400 })
    }

    // Find lead in Airtable
    const lead = await findLeadByEmail(fromEmail)
    if (!lead) {
      // Unknown sender — log to console but don't error
      console.log(`Inbound reply from unknown sender: ${fromEmail}`)
      return NextResponse.json({ ok: true, status: 'unknown_sender' })
    }

    const company = lead.fields['Company'] || fromEmail

    // Classify the reply with Claude
    const classification = await classifyReply(replyText, company)

    // Update Airtable with reply status + suggested response
    await updateLeadReply(lead.id, classification.intent, classification.summary, classification.suggestedResponse)

    // Log to Campaign Log
    await fetch(`https://api.airtable.com/v0/${BASE}/tbli5CIBIqRXIkRqe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AT()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: [{ fields: {
          'Campaign ID':   `REPLY-${Date.now()}`,
          'Company':       company,
          'Contact Email': fromEmail,
          'Subject':       `REPLY: ${subject}`,
          'Sequence Step': `Reply (${classification.intent})`,
          'Sent At':       new Date().toISOString(),
          'Result':        classification.intent === 'interested' ? 'Replied - Interested'
                         : classification.intent === 'unsubscribe' ? 'Unsubscribed'
                         : `Replied - ${classification.intent}`,
        }}],
        typecast: true,
      }),
    })

    return NextResponse.json({
      ok: true,
      lead: company,
      intent: classification.intent,
      summary: classification.summary,
    })
  } catch (e: any) {
    console.error('Inbound reply error:', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

// Also accept GET for webhook verification (SendGrid does this)
export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true, endpoint: 'TradeCafe inbound reply handler' })
}

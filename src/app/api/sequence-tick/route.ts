import { NextRequest, NextResponse } from 'next/server'
import { sendEmail as gmailSend, listInbox } from '@/lib/gmail'
import { sendDiscordNotification } from '@/lib/discord'

const BASE  = 'appCYgmFc8vTfwyv1'
const LEADS = `https://api.airtable.com/v0/${BASE}/tblAsQXKEK9chUaT6`
const LOG   = `https://api.airtable.com/v0/${BASE}/tbli5CIBIqRXIkRqe`
const AT    = () => process.env.AIRTABLE_API_KEY!

const FU1_DAYS = 5
const FU2_DAYS = 7

async function atGet(url: string)  { return fetch(url, { headers: { Authorization: `Bearer ${AT()}` }, next: { revalidate: 0 } }).then(r => r.json()) }
async function atPatch(id: string, fields: any) {
  return fetch(`${LEADS}/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${AT()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields, typecast: true }) }).then(r => r.json())
}
async function atLog(fields: any) {
  return fetch(LOG, { method: 'POST', headers: { Authorization: `Bearer ${AT()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ records: [{ fields }], typecast: true }) })
}

async function sendSequenceEmail(to: string, subject: string, body: string): Promise<string> {
  const result = await gmailSend({ to, subject, body })
  if (!result.ok) throw new Error(result.error || 'Gmail send failed')
  return result.messageId || ''
}

const NDR_SENDERS  = /mailer-daemon|postmaster|mail-delivery|delivery.status|bounce|noreply@.*mail/i
const NDR_SUBJECTS = /undeliverable|delivery.fail|returned.mail|delivery.status|bounce|could.not.deliver|non.delivery|failure.notice/i

async function classifyReply(text: string, company: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514', max_tokens: 500,
      system: 'Classify B2B sales email replies. Respond ONLY with valid JSON, no markdown.',
      messages: [{ role: 'user', content: `Classify this reply to a cold outreach email from ${company}:\n\n"""\n${text.slice(0, 1500)}\n"""\n\nIntent: "interested"|"unsubscribe"|"not_now"|"question"|"other"\n\nReturn JSON: {"intent":"...","summary":"one sentence","suggestedResponse":"2-3 sentences, warm and direct, never start with I"}` }],
    }),
  })
  const d = await res.json()
  const raw = d.content?.[0]?.text || ''
  try {
    const match = raw.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
  } catch {}
  return { intent: 'other', summary: 'Reply received', suggestedResponse: '' }
}

function daysSince(dateStr: string): number {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

// ── Main cron handler ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const cronSecret = process.env.CRON_SECRET || ''
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const results = { repliesFound: 0, bouncesFound: 0, fu1Sent: 0, fu2Sent: 0, skipped: 0, errors: 0 }
  const hotReplies: { company: string; intent: string; email: string }[] = []

  try {
    // ── 1. Load all leads ─────────────────────────────────────────────────────
    let offset: string | undefined
    const leads: any[] = []
    do {
      const data = await atGet(`${LEADS}?pageSize=100${offset ? `&offset=${offset}` : ''}`)
      leads.push(...(data.records || []))
      offset = data.offset
    } while (offset)

    const activeLookup = new Map<string, any>()
    for (const r of leads) {
      const email = r.fields['Contact Email']?.toLowerCase()
      const seq   = r.fields['Sequence Status'] || 'Cold'
      if (email && !['Cold', 'Opted Out'].includes(seq)) {
        activeLookup.set(email, r)
      }
    }

    // ── 2. Scan inbox for replies via Gmail API ───────────────────────────────
    if (activeLookup.size > 0) {
      const sinceDate = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0]
      const { messages } = await listInbox({ query: 'in:inbox', afterDate: sinceDate, maxResults: 100 })

      for (const msg of messages) {
        const fromEmail  = (msg.fromEmail || '').toLowerCase()
        const fromDomain = fromEmail.split('@')[1] || ''

        // NDR bounce detection
        if (NDR_SENDERS.test(fromEmail) || NDR_SUBJECTS.test(msg.subject || '')) {
          const failedRecipient = Array.from(activeLookup.keys()).find(e =>
            (msg.body || '').toLowerCase().includes(e)
          )
          if (failedRecipient) {
            const record = activeLookup.get(failedRecipient)
            if (record && !record.fields['Bounced']) {
              await atPatch(record.id, {
                'Bounced': true, 'Bounce Reason': (msg.body || '').slice(0, 200),
                'Bounce Date': now.toISOString().split('T')[0],
                'Status': 'New', 'Sequence Status': 'Cold',
              })
              results.bouncesFound++
            }
          }
          continue
        }

        // Match reply to CRM lead
        let matchedEmail = activeLookup.has(fromEmail) ? fromEmail : null
        if (!matchedEmail) {
          const keys = Array.from(activeLookup.keys())
          for (const ce of keys) {
            if (ce.split('@')[1] === fromDomain) { matchedEmail = ce; break }
          }
        }
        if (!matchedEmail) continue

        const record = activeLookup.get(matchedEmail)
        if (!record) continue
        const curSeq = record.fields['Sequence Status'] || ''
        if (['Replied', 'Booked', 'Opted Out'].includes(curSeq) && record.fields['Reply Text']) continue

        const company = record.fields['Company'] || matchedEmail
        const classification = await classifyReply(msg.body || msg.snippet, company)

        const statusMap: Record<string, string> = {
          interested: 'Replied', unsubscribe: 'Opted Out',
          not_now: 'Replied', question: 'Replied', other: 'Replied',
        }

        await atPatch(record.id, {
          'Status': statusMap[classification.intent] || 'Replied',
          'Sequence Status': statusMap[classification.intent] || 'Replied',
          'Last Contacted': now.toISOString().split('T')[0],
          'Reply Text': (msg.body || msg.snippet).slice(0, 5000),
          'Reply Date': now.toISOString().split('T')[0],
          'Reply Intent': classification.intent,
          'Suggested Reply': classification.suggestedResponse,
        })

        await atLog({
          'Campaign ID': `REPLY-${Date.now()}`, 'Company': company,
          'Contact Email': matchedEmail, 'Subject': `REPLY: ${msg.subject}`,
          'Sequence Step': `Reply (${classification.intent})`,
          'Sent At': now.toISOString(),
          'Result': classification.intent === 'interested' ? 'Replied - Interested'
                  : classification.intent === 'unsubscribe' ? 'Unsubscribed'
                  : `Replied - ${classification.intent}`,
        })

        sendDiscordNotification({
          type: 'new_reply', company,
          contactName: record.fields['Contact Name'] || '',
          email: matchedEmail, intent: classification.intent,
          summary: classification.summary,
          suggestedReply: classification.suggestedResponse,
        }).catch(() => {})

        hotReplies.push({ company, intent: classification.intent, email: matchedEmail })
        activeLookup.delete(matchedEmail)
        results.repliesFound++
      }
    }

    // ── 3. Fire follow-up emails via Gmail API ────────────────────────────────
    for (const record of leads) {
      const f   = record.fields
      const seq = f['Sequence Status'] || 'Cold'
      const email = f['Contact Email']

      if (!email || f['Bounced']) { results.skipped++; continue }
      if (['Cold', 'Replied', 'Booked', 'Opted Out'].includes(seq)) { results.skipped++; continue }

      const lastDate = f['Last Contacted'] || ''

      // FU1
      if (seq === 'Email 1 Sent' && f['Follow-up 1 Body'] && f['Follow-up 1 Subject']) {
        if (daysSince(lastDate) >= FU1_DAYS) {
          try {
            const msgId = await sendSequenceEmail(email, f['Follow-up 1 Subject'], f['Follow-up 1 Body'])
            await atPatch(record.id, {
              'Sequence Status': 'Follow-up 1 Sent',
              'Last Contacted':  now.toISOString().split('T')[0],
              'Follow Up #':     2,
            })
            await atLog({
              'Campaign ID': `FU1-${Date.now()}`, 'Company': f['Company'],
              'Contact Email': email, 'Subject': f['Follow-up 1 Subject'],
              'Sequence Step': 'Follow-up 1', 'Sent At': now.toISOString(),
              'Message ID': msgId, 'Result': 'Sent',
            })
            results.fu1Sent++
          } catch (e: any) {
            console.error(`FU1 error for ${f['Company']}: ${e.message}`)
            results.errors++
          }
        } else { results.skipped++ }
      }

      // FU2
      else if (seq === 'Follow-up 1 Sent' && f['Follow-up 2 Body'] && f['Follow-up 2 Subject']) {
        if (daysSince(lastDate) >= FU2_DAYS) {
          try {
            const msgId = await sendSequenceEmail(email, f['Follow-up 2 Subject'], f['Follow-up 2 Body'])
            await atPatch(record.id, {
              'Sequence Status': 'Follow-up 2 Sent',
              'Last Contacted':  now.toISOString().split('T')[0],
              'Follow Up #':     3,
            })
            await atLog({
              'Campaign ID': `FU2-${Date.now()}`, 'Company': f['Company'],
              'Contact Email': email, 'Subject': f['Follow-up 2 Subject'],
              'Sequence Step': 'Follow-up 2', 'Sent At': now.toISOString(),
              'Message ID': msgId, 'Result': 'Sent',
            })
            results.fu2Sent++
          } catch (e: any) {
            console.error(`FU2 error for ${f['Company']}: ${e.message}`)
            results.errors++
          }
        } else { results.skipped++ }
      }
    }

    // ── 4. Discord cron summary ───────────────────────────────────────────────
    const anythingHappened = results.repliesFound > 0 || results.fu1Sent > 0 || results.fu2Sent > 0 || results.bouncesFound > 0 || results.errors > 0
    if (anythingHappened) {
      sendDiscordNotification({
        type: 'cron_summary',
        leadsChecked: leads.length,
        repliesFound: results.repliesFound,
        fu1Sent: results.fu1Sent,
        fu2Sent: results.fu2Sent,
        errors: results.errors,
        hotReplies,
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, timestamp: now.toISOString(), leadsChecked: leads.length, ...results })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

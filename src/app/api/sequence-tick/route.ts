import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { ImapFlow } from 'imapflow'
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

async function sendEmail(to: string, subject: string, body: string, recordId?: string) {
  const from   = process.env.SMTP_EMAIL!
  const pass   = process.env.SMTP_PASSWORD!
  const appUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://tradecafe-bd.vercel.app'
  const pixel  = recordId
    ? `<img src="${appUrl}/api/track/${recordId}" width="1" height="1" style="display:none" alt=""/>`
    : ''
  const t = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: from, pass }, tls: { rejectUnauthorized: false }, connectionTimeout: 15000, socketTimeout: 15000 })
  await t.verify()
  const info = await t.sendMail({
    from: `Brandon @ TradeCafe <${from}>`, replyTo: `Brandon @ TradeCafe <${from}>`, to, subject,
    text: body + '\n\n---\nTo unsubscribe reply with "unsubscribe".',
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;max-width:600px">
      ${body.replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>').replace(/^/,'<p>').replace(/$/,'</p>')}
      <p style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#999">To unsubscribe, reply with "unsubscribe".</p>${pixel}</div>`,
    headers: { 'List-Unsubscribe': `<mailto:${from}?subject=unsubscribe>`, 'Precedence': 'bulk' },
  })
  t.close()
  return info.messageId
}

// ── NDR bounce detection ──────────────────────────────────────────────────────
const NDR_SENDERS  = /mailer-daemon|postmaster|mail-delivery|delivery.status|bounce|noreply@.*mail/i
const NDR_SUBJECTS = /undeliverable|delivery.fail|returned.mail|delivery.status|bounce|could.not.deliver|non.delivery|failure.notice/i
const NDR_BODY_RE  = /(?:failed recipient|original recipient|final recipient|to:|for)\s*<?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>?/gi

function extractNDRRecipient(text: string): string | null {
  NDR_BODY_RE.lastIndex = 0
  const m = NDR_BODY_RE.exec(text)
  return m ? m[1].toLowerCase().trim() : null
}

function extractPlainText(raw: string): string {
  // Try to get the text/plain MIME part
  const plainMatch = raw.match(/Content-Type: text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|$)/i)
  if (plainMatch?.[1]?.trim()) return plainMatch[1].trim().slice(0, 3000)
  // Strip HTML tags as fallback
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000)
}

// ── IMAP inbox scanner ────────────────────────────────────────────────────────
// KEY FIX: search ALL recent messages (not just unseen) so webmail-read replies
// are still detected. Use a date window and match by email domain as fallback.
async function checkInboxForReplies(
  contactEmails: Set<string>,
  since: Date
): Promise<{ from: string; subject: string; text: string; uid: number }[]> {
  const host = process.env.SMTP_EMAIL!
  const pass = process.env.SMTP_PASSWORD!
  const results: { from: string; subject: string; text: string; uid: number }[] = []

  // Build domain lookup too — match by domain if exact email fails
  const domainToEmails = new Map<string, string[]>()
  for (const email of Array.from(contactEmails)) {
    const domain = email.split('@')[1]
    if (domain) {
      if (!domainToEmails.has(domain)) domainToEmails.set(domain, [])
      domainToEmails.get(domain)!.push(email)
    }
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: host, pass }, logger: false,
    tls: { rejectUnauthorized: false },
  })

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')

    // FIXED: search ALL messages (seen + unseen) in the date window
    // Previously was { seen: false } which missed already-read replies
    const sinceStr     = since.toISOString().split('T')[0]
    const searchResult = await client.search({ since: new Date(sinceStr) })
    const uids         = Array.isArray(searchResult) ? searchResult : []

    if (uids.length > 0) {
      for await (const msg of client.fetch(uids, { envelope: true, source: true })) {
        const fromAddr  = msg.envelope?.from?.[0]?.address?.toLowerCase() || ''
        const fromDomain = fromAddr.split('@')[1] || ''
        const subject   = msg.envelope?.subject || ''
        const raw       = msg.source?.toString() || ''
        const text      = extractPlainText(raw)
        const uid       = msg.uid || 0

        if (!fromAddr) continue

        // ── NDR bounce: check BEFORE reply matching ──────────────────────
        const isNDRSender  = NDR_SENDERS.test(fromAddr)
        const isNDRSubject = NDR_SUBJECTS.test(subject)

        if (isNDRSender || isNDRSubject) {
          // Extract who the bounce is about
          const failedRecipient =
            extractNDRRecipient(text) ||
            extractNDRRecipient(raw) ||
            Array.from(contactEmails).find(e => raw.toLowerCase().includes(e))

          if (failedRecipient) {
            const normalised = failedRecipient.toLowerCase()
            if (contactEmails.has(normalised)) {
              results.push({ from: normalised, subject, text: `__NDR_BOUNCE__ ${text.slice(0, 500)}`, uid })
            }
          }
          // Mark seen regardless — don't re-process NDRs
          try { await client.messageFlagsAdd([msg.seq], ['\\Seen']) } catch {}
          continue
        }

        // ── Normal reply: exact email match ─────────────────────────────
        if (contactEmails.has(fromAddr)) {
          results.push({ from: fromAddr, subject, text, uid })
          try { await client.messageFlagsAdd([msg.seq], ['\\Seen']) } catch {}
          continue
        }

        // ── Fuzzy match: same domain as a known lead ─────────────────────
        // Catches replies from aliases, forwarded addresses, etc.
        const domainMatches = domainToEmails.get(fromDomain) || []
        if (domainMatches.length === 1) {
          // Only auto-match if exactly ONE lead from this domain (unambiguous)
          results.push({ from: domainMatches[0], subject, text, uid })
          try { await client.messageFlagsAdd([msg.seq], ['\\Seen']) } catch {}
        }
      }
    }

    await client.mailboxClose()
    await client.logout()
  } catch (e: any) {
    console.error('IMAP error:', e.message)
    try { await client.logout() } catch {}
  }

  return results
}

// ── Claude reply classifier ───────────────────────────────────────────────────
async function classifyReply(text: string, company: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514', max_tokens: 500,
      system: 'Classify B2B sales email replies. Respond ONLY with valid JSON, no markdown.',
      messages: [{ role: 'user', content: `Classify this reply to a cold outreach email from ${company}:\n\n"""\n${text.slice(0, 1500)}\n"""\n\nIntent options:\n- "interested": wants demo, call, more info, pricing, availability\n- "unsubscribe": remove me, not interested, stop emailing, opt out\n- "not_now": timing off, busy, come back later, already have solution\n- "question": specific question about product/pricing/features\n- "other": out of office, wrong person, unclear\n\nReturn JSON: {"intent":"...","summary":"one sentence what they said","suggestedResponse":"2-3 sentences, warm and direct, never start with I"}` }],
    }),
  })
  const d = await res.json()
  const raw = d.content?.[0]?.text || ''
  try {
    const clean = raw.replace(/```json|```/g, '').trim()
    const match = clean.match(/\{[\s\S]*\}/)
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
  // Auth
  const authHeader = req.headers.get('authorization') || ''
  const cronSecret = process.env.CRON_SECRET || ''
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now     = new Date()
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

    // Build lookup: email → record (include ALL sent leads, not just unseen)
    const activeLookup = new Map<string, any>()
    for (const r of leads) {
      const email = r.fields['Contact Email']?.toLowerCase()
      const seq   = r.fields['Sequence Status'] || 'Cold'
      // Include all leads that have been sent to, even if already replied
      // (we'll check for duplicates when processing)
      if (email && !['Cold', 'Opted Out'].includes(seq)) {
        activeLookup.set(email, r)
      }
    }

    // ── 2. Scan inbox for replies + NDR bounces ───────────────────────────────
    if (activeLookup.size > 0 && process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD) {
      // Look back 30 days to catch anything missed (was 14 days)
      const since   = new Date(now.getTime() - 30 * 86400000)
      const replies = await checkInboxForReplies(new Set(activeLookup.keys()), since)

      for (const reply of replies) {
        const record = activeLookup.get(reply.from.toLowerCase())
        if (!record) continue

        const company = record.fields['Company'] || reply.from
        const curSeq  = record.fields['Sequence Status'] || ''

        // ── NDR bounce ────────────────────────────────────────────────────
        if (reply.text.startsWith('__NDR_BOUNCE__')) {
          // Skip if already marked bounced
          if (record.fields['Bounced']) continue

          const bounceReason = reply.text.replace('__NDR_BOUNCE__ ', '').slice(0, 200)
          await atPatch(record.id, {
            'Bounced':         true,
            'Bounce Reason':   bounceReason,
            'Bounce Date':     now.toISOString().split('T')[0],
            'Status':          'New',
            'Sequence Status': 'Cold',
          })
          await atLog({
            'Campaign ID':   `BOUNCE-${Date.now()}`,
            'Company':       company,
            'Contact Email': reply.from,
            'Subject':       reply.subject,
            'Sequence Step': 'Bounce',
            'Sent At':       now.toISOString(),
            'Result':        'Bounced - NDR',
          })
          sendDiscordNotification({
            type: 'new_reply', company,
            contactName: record.fields['Contact Name'] || '',
            email: reply.from, intent: 'unsubscribe',
            summary: `⚡ Email bounced (NDR). Address likely invalid.`,
            suggestedReply: 'Find a replacement email address.',
          }).catch(() => {})
          activeLookup.delete(reply.from.toLowerCase())
          results.bouncesFound++
          results.repliesFound++
          continue
        }

        // ── Skip if already processed this reply ──────────────────────────
        if (['Replied', 'Booked', 'Opted Out'].includes(curSeq) && record.fields['Reply Text']) {
          continue
        }

        // ── Classify normal reply ─────────────────────────────────────────
        const classification = await classifyReply(reply.text, company)

        const statusMap: Record<string, string> = {
          interested:  'Replied', unsubscribe: 'Opted Out',
          not_now:     'Replied', question:    'Replied', other: 'Replied',
        }

        await atPatch(record.id, {
          'Status':           statusMap[classification.intent] || 'Replied',
          'Sequence Status':  statusMap[classification.intent] || 'Replied',
          'Last Contacted':   now.toISOString().split('T')[0],
          'Reply Text':       reply.text.slice(0, 5000),
          'Reply Date':       now.toISOString().split('T')[0],
          'Reply Intent':     classification.intent,
          'Suggested Reply':  classification.suggestedResponse,
          'Personalization Notes':
            `[REPLY ${now.toLocaleDateString()} — ${classification.intent.toUpperCase()}]\n` +
            `${classification.summary}\n\nSuggested:\n${classification.suggestedResponse}`,
        })

        await atLog({
          'Campaign ID':   `REPLY-${Date.now()}`,
          'Company':       company,
          'Contact Email': reply.from,
          'Subject':       `REPLY: ${reply.subject}`,
          'Sequence Step': `Reply (${classification.intent})`,
          'Sent At':       now.toISOString(),
          'Result':        classification.intent === 'interested' ? 'Replied - Interested'
                         : classification.intent === 'unsubscribe' ? 'Unsubscribed'
                         : `Replied - ${classification.intent}`,
        })

        sendDiscordNotification({
          type: 'new_reply', company,
          contactName: record.fields['Contact Name'] || '',
          email: reply.from, intent: classification.intent,
          summary: classification.summary,
          suggestedReply: classification.suggestedResponse,
        }).catch(() => {})

        hotReplies.push({ company, intent: classification.intent, email: reply.from })
        activeLookup.delete(reply.from.toLowerCase())
        results.repliesFound++
      }
    }

    // ── 3. Fire follow-up emails ──────────────────────────────────────────────
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
            const msgId = await sendEmail(email, f['Follow-up 1 Subject'], f['Follow-up 1 Body'], record.id)
            await atPatch(record.id, {
              'Sequence Status':  'Follow-up 1 Sent',
              'Last Contacted':   now.toISOString().split('T')[0],
              'Follow Up #':      2,
            })
            await atLog({
              'Campaign ID':   `FU1-${Date.now()}`, 'Company': f['Company'],
              'Contact Email': email, 'Subject': f['Follow-up 1 Subject'],
              'Sequence Step': 'Follow-up 1', 'Sent At': now.toISOString(),
              'Message ID':    msgId, 'Result': 'Sent',
            })
            results.fu1Sent++
          } catch (e: any) {
            console.error(`FU1 error for ${f['Company']}: ${e.message}`)
            if (/55[0-4]|bounce|undeliver/i.test(e.message)) {
              await atPatch(record.id, { 'Bounced': true, 'Bounce Reason': e.message.slice(0, 200), 'Bounce Date': now.toISOString().split('T')[0], 'Status': 'New', 'Sequence Status': 'Cold' })
              results.bouncesFound++
            }
            results.errors++
          }
        } else { results.skipped++ }
      }

      // FU2
      else if (seq === 'Follow-up 1 Sent' && f['Follow-up 2 Body'] && f['Follow-up 2 Subject']) {
        if (daysSince(lastDate) >= FU2_DAYS) {
          try {
            const msgId = await sendEmail(email, f['Follow-up 2 Subject'], f['Follow-up 2 Body'], record.id)
            await atPatch(record.id, {
              'Sequence Status':  'Follow-up 2 Sent',
              'Last Contacted':   now.toISOString().split('T')[0],
              'Follow Up #':      3,
            })
            await atLog({
              'Campaign ID':   `FU2-${Date.now()}`, 'Company': f['Company'],
              'Contact Email': email, 'Subject': f['Follow-up 2 Subject'],
              'Sequence Step': 'Follow-up 2', 'Sent At': now.toISOString(),
              'Message ID':    msgId, 'Result': 'Sent',
            })
            results.fu2Sent++
          } catch (e: any) {
            console.error(`FU2 error for ${f['Company']}: ${e.message}`)
            if (/55[0-4]|bounce|undeliver/i.test(e.message)) {
              await atPatch(record.id, { 'Bounced': true, 'Bounce Reason': e.message.slice(0, 200), 'Bounce Date': now.toISOString().split('T')[0], 'Status': 'New', 'Sequence Status': 'Cold' })
              results.bouncesFound++
            }
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
        fu1Sent:      results.fu1Sent,
        fu2Sent:      results.fu2Sent,
        errors:       results.errors,
        hotReplies,
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, timestamp: now.toISOString(), leadsChecked: leads.length, ...results })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

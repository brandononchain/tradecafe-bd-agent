import { NextRequest, NextResponse } from 'next/server'

const BASE  = 'appCYgmFc8vTfwyv1'
const TABLE = 'tblAsQXKEK9chUaT6'
const AT    = () => process.env.AIRTABLE_API_KEY!

// ── Inline Claude caller (avoids internal HTTP fetch which breaks on Vercel) ──
const SYSTEM_PROMPT = `You are an expert cold email copywriter specializing in crypto, trading, and partner network outreach. You write emails that get replies from crypto KOLs, trading influencers, fund managers, and DeFi builders.

HARD RULES — violating any of these is a failure:
- NEVER use dashes or hyphens as connectors (no em dashes, no " — ", no " - " between clauses). Use periods or commas instead.
- NEVER start a sentence with "I"
- NEVER say: "Hope this finds you well", "I wanted to reach out", "touching base", "circling back", "following up", "just checking in", "wanted to see", "quick question", "synergy", "game-changer", "revolutionary", "streamline", "leverage", "utilize", "pain points"
- NEVER use ALL CAPS anywhere
- NEVER use more than one exclamation mark in the entire email
- NEVER give the recipient two equal choices — one primary ask, one quiet secondary
- NEVER write more than 6 sentences in a cold email body
- NEVER write more than 3 sentences in a follow-up body
- Keep sentences short. Under 20 words each.

TONE: A peer crypto builder writing to another trader or KOL. Warm, direct, specific. Crypto native. Lead with data and proof.

Respond ONLY with valid JSON. No markdown fences. No explanation.`

async function callClaude(prompt: string, maxTokens = 600): Promise<any> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: prompt }],
    }),
  })
  const data  = await res.json()
  const raw   = data.content?.[0]?.text || ''
  const match = raw.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in Claude response')
  return JSON.parse(match[0])
}

function buildColdPrompt(lead: any, senderName: string): string {
  return `Write a cold outreach email FROM TradeCafe (tradecafe.ai) TO a decision maker at ${lead.company}.

ABOUT TRADECAFE: AI-assisted trading platform with a partner revenue share network. AI generates trade signals with built-in risk management. Partners earn recurring revenue share (10-25%) when their referral network trades. Performance-based, compounding income.

ABOUT THE RECIPIENT:
Company: ${lead.company} (${lead.companyType})
What they do: ${lead.description || lead.notes || 'Crypto/trading/DeFi'}
Top repos/projects: ${lead.topRepos || lead.githubOrgUrl || 'N/A'}
GitHub: ${lead.githubStars ? `${lead.githubStars.toLocaleString()} stars` : ''} ${lead.orgMembers ? `· ${lead.orgMembers} org members` : ''}
Contact: ${lead.contactName ? `${lead.contactName}${lead.jobTitle ? ` (${lead.jobTitle})` : ''}` : 'decision maker'}

EMAIL STRUCTURE:
- Subject: 4-7 words, specific to their actual work or niche, no question marks
- Opening: one sharp observation about what they build or their content
- 2-3 sentences on the opportunity: most partnership deals are flat fee with no recurring value. TradeCafe's model is performance-based revenue share that compounds monthly.
- 1 sentence on TradeCafe
- Primary CTA: "Worth a 15-minute call?" or a specific variation tied to their work
- Optional quiet secondary: "Or check the PNL proof at tradecafe.ai" only if natural
- Sign off: ${senderName}
  brandon@tradecafe.ai

Return JSON: {"subject":"...","body":"..."}`
}

function buildFU1Prompt(lead: any, coldSubject: string, senderName: string): string {
  return `Write follow-up email #1 for TradeCafe outreach to ${lead.company}. Sent 5 days after the cold email, no reply.

Original subject: "${coldSubject}"
Company: ${lead.company} — ${lead.description || lead.notes || 'Crypto/trading/DeFi'}
Top repos: ${lead.topRepos || 'N/A'}

RULES:
- 2 to 3 sentences MAX
- No apology, no "just following up", no needy energy
- New angle: show something specific tied to their trading niche — latest PNL data, partner earnings, or a specific result, one concrete number, or a demo offer
- End with a small specific ask: a day and time, or "5 minutes this week?"
- Subject: Re: ${coldSubject}

Return JSON: {"subject":"Re: ${coldSubject}","body":"..."}`
}

function buildFU2Prompt(lead: any, coldSubject: string, senderName: string): string {
  return `Write the final breakup email for TradeCafe outreach to ${lead.company}. Two emails sent, no reply.

Original subject: "${coldSubject}"
Company: ${lead.company} — ${lead.description || lead.notes || 'Crypto/trading/DeFi'}

RULES:
- 2 sentences ONLY
- Sentence 1: one final specific insight relevant to their work
- Sentence 2: graceful exit. "No worries if the timing is off, I will leave it here." Zero pressure, zero guilt.
- Subject: Re: ${coldSubject}

Return JSON: {"subject":"Re: ${coldSubject}","body":"..."}`
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { recordIds, senderName = 'Brandon @ TradeCafe' } = await req.json()

  // Load leads from Airtable
  let leads: any[] = []

  if (recordIds?.length) {
    for (const id of recordIds) {
      const r = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}/${id}`, {
        headers: { Authorization: `Bearer ${AT()}` },
      })
      if (r.ok) leads.push(await r.json())
    }
  } else {
    // All leads that have an email body
    let offset: string | undefined
    do {
      const qs = offset ? `pageSize=100&offset=${offset}` : 'pageSize=100'
      const r  = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}?${qs}`, {
        headers: { Authorization: `Bearer ${AT()}` },
      })
      const d = await r.json()
      leads.push(...(d.records || []).filter((rec: any) => rec.fields['Email Body']))
      offset = d.offset
    } while (offset)
  }

  if (!leads.length) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No leads to regenerate' })
  }

  // Process up to 8 leads per call (Vercel 25s timeout)
  const batch   = leads.slice(0, 8)
  const results: { id: string; company: string; ok: boolean; error?: string }[] = []

  for (const record of batch) {
    const f    = record.fields
    const lead = {
      company:      f['Company'] || '',
      companyType:  f['Company Type'] || 'AI/ML Startup',
      description:  f['Personalization Notes'] || '',
      notes:        f['Personalization Notes'] || '',
      topRepos:     f['Top Repos'] || '',
      aiTools:      f['AI Tools Used'] || '',
      githubStars:  f['GitHub Stars'] || 0,
      orgMembers:   f['Org Members'] || 0,
      website:      f['Website'] || '',
      githubOrgUrl: f['GitHub Org URL'] || '',
      contactName:  f['Contact Name'] || '',
      jobTitle:     f['Job Title'] || '',
    }

    try {
      // Generate cold email
      const cold = await callClaude(buildColdPrompt(lead, senderName))
      if (!cold.subject || !cold.body) throw new Error('Cold email generation failed')

      // Generate follow-ups
      const fu1 = await callClaude(buildFU1Prompt(lead, cold.subject, senderName), 400)
      const fu2 = await callClaude(buildFU2Prompt(lead, cold.subject, senderName), 300)

      // Save to Airtable
      await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}/${record.id}`, {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${AT()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            'Email Subject':       cold.subject,
            'Email Body':          cold.body,
            'Follow-up 1 Subject': fu1.subject || `Re: ${cold.subject}`,
            'Follow-up 1 Body':    fu1.body    || '',
            'Follow-up 2 Subject': fu2.subject || `Re: ${cold.subject}`,
            'Follow-up 2 Body':    fu2.body    || '',
          },
          typecast: true,
        }),
      })

      results.push({ id: record.id, company: lead.company, ok: true })
    } catch (e: any) {
      results.push({ id: record.id, company: lead.company, ok: false, error: e.message })
    }

    await new Promise(r => setTimeout(r, 400))
  }

  return NextResponse.json({
    ok:        true,
    processed: results.length,
    total:     leads.length,
    done:      leads.length <= 8,
    remaining: Math.max(0, leads.length - 8),
    results,
  })
}

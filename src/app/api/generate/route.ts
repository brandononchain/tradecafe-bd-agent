import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `You are an expert cold email copywriter specializing in crypto, trading, and partner network outreach. You write emails that get replies from crypto KOLs, trading influencers, fund managers, DeFi builders, and community leaders. You understand crypto Twitter culture, trading lingo, and what makes partnership pitches land in this space.

HARD RULES — violating any of these is a failure:
- NEVER use dashes or hyphens as connectors (no em dashes, no " — ", no " - " between clauses). Use periods or commas instead.
- NEVER start a sentence with "I"
- NEVER say: "Hope this finds you well", "I wanted to reach out", "touching base", "circling back", "following up", "just checking in", "wanted to see", "quick question", "synergy", "game-changer", "revolutionary", "streamline", "leverage", "utilize", "pain points"
- NEVER use ALL CAPS anywhere
- NEVER use more than one exclamation mark in the entire email
- NEVER give the recipient two equal choices ("book a call OR try the platform") — one primary ask, one quiet secondary
- NEVER write more than 6 sentences in a cold email body
- NEVER write more than 3 sentences in a follow-up body
- Keep sentences short. Under 20 words each.

TONE: A peer crypto builder writing to another trader or KOL. Warm, direct, specific. Crypto native language is fine. Not a salesperson. Lead with data and proof, not hype.

Respond ONLY with valid JSON. No markdown fences. No explanation.`

function buildColdEmailPrompt(lead: any, senderName: string): string {
  return `Write a cold outreach email FROM TradeCafe (tradecafe.ai) TO a decision maker at ${lead.company}.

ABOUT TRADECAFE:
TradeCafe is an AI-assisted trading platform with a partner revenue share network. The AI generates trade signals with built-in risk management (entry, targets, stop loss, confidence score). Partners earn recurring revenue share when their referral network trades. Tier system: Bronze 10%, Silver 15%, Gold 20%, Platinum 25%+. Not a flat fee sponsorship. Performance-based, compounding, recurring income.

Partner referral link: https://tradecafe.ai/join/6a6b1e01-7e53-4a25-8912-8f7bb089dec1

ABOUT THE RECIPIENT:
Company: ${lead.company} (${lead.companyType})
What they do: ${lead.description || lead.notes || 'Crypto/trading/DeFi'}
Top repos/projects: ${lead.topRepos || lead.githubOrgUrl || 'N/A'}
Tech/niche: ${lead.aiTools || 'Crypto/trading'}
GitHub: ${lead.githubStars ? `${lead.githubStars.toLocaleString()} stars` : ''} ${lead.orgMembers ? `· ${lead.orgMembers} org members` : ''}
Contact: ${lead.contactName ? `${lead.contactName}${lead.jobTitle ? ` (${lead.jobTitle})` : ''}` : 'decision maker'}

EMAIL STRUCTURE:
- Subject: 4-7 words, specific to their actual work or niche, no question marks
- Opening sentence: one sharp observation about what they build or their content (cite a real repo, product, or post if available)
- 2-3 sentences on the opportunity: most partnership deals are flat fee with no recurring value. TradeCafe's partner model is performance-based revenue share that compounds. Their audience trades, they earn. Monthly. Recurring.
- 1 sentence on TradeCafe: AI trading signals with built-in risk management, not another shill deal
- CTA (primary): "Worth a 15-minute call this week?" or a specific variation tied to their work
- CTA (secondary, optional): "Or check the PNL proof at tradecafe.ai" only if natural
- Sign off: ${senderName}
  brandon@tradecafe.ai

Return JSON: {"subject":"...","body":"..."}`
}

function buildFollowUp1Prompt(lead: any, coldSubject: string, senderName: string): string {
  return `Write follow-up email #1 for TradeCafe outreach to ${lead.company}. Sent 5 days after the cold email, no reply received.

Original subject: "${coldSubject}"
Company: ${lead.company} — ${lead.description || lead.notes || 'Crypto/trading/DeFi'}

RULES:
- 2 to 3 sentences MAX. Respect their time.
- No apology, no "just following up", no needy energy
- New angle: share something specific — latest PNL card data, a partner earnings milestone this month, or a concrete revenue share number
- End with a small ask: a specific day and time, or "5 minutes this week?"
- Subject: Re: ${coldSubject}
- Tone: confident, brief, crypto native

Return JSON: {"subject":"Re: ${coldSubject}","body":"..."}`
}

function buildFollowUp2Prompt(lead: any, coldSubject: string, senderName: string): string {
  return `Write the final breakup email for TradeCafe outreach to ${lead.company}. Two emails sent, no reply.

Original subject: "${coldSubject}"
Company: ${lead.company} — ${lead.description || lead.notes || 'Crypto/trading/DeFi'}

RULES:
- 2 sentences ONLY. No exceptions.
- Sentence 1: one final insight relevant to their trading niche or crypto activity that they might find genuinely useful, even without replying
- Sentence 2: a graceful exit. "No worries if the timing is off, leaving it here." Friendly, zero pressure, zero guilt.
- No passive aggression. No "I guess you're not interested." No "last chance."
- Subject: Re: ${coldSubject}

Return JSON: {"subject":"Re: ${coldSubject}","body":"..."}`
}

// ── API handler ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { lead, senderName = 'Brandon @ TradeCafe', mode = 'all' } = await req.json()

  const callClaude = async (prompt: string, maxTokens = 600) => {
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

  try {
    if (mode === 'cold') {
      const result = await callClaude(buildColdEmailPrompt(lead, senderName))
      if (!result.subject || !result.body) throw new Error('Missing subject or body')
      return NextResponse.json({ ok: true, subject: result.subject, body: result.body })
    }

    // mode === 'all': cold + FU1 + FU2
    const cold = await callClaude(buildColdEmailPrompt(lead, senderName))
    if (!cold.subject || !cold.body) throw new Error('Cold email generation failed')

    const fu1 = await callClaude(buildFollowUp1Prompt(lead, cold.subject, senderName), 400)
    const fu2 = await callClaude(buildFollowUp2Prompt(lead, cold.subject, senderName), 300)

    return NextResponse.json({
      ok:               true,
      subject:          cold.subject,
      body:             cold.body,
      followUp1Subject: fu1.subject || `Re: ${cold.subject}`,
      followUp1Body:    fu1.body    || '',
      followUp2Subject: fu2.subject || `Re: ${cold.subject}`,
      followUp2Body:    fu2.body    || '',
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

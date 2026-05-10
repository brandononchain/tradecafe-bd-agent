import { NextResponse } from 'next/server'
import { verifyGmail } from '@/lib/gmail'

const BASE_ID = 'appCYgmFc8vTfwyv1'
const LEADS_TABLE = 'tblAsQXKEK9chUaT6'
const LOG_TABLE = 'tbli5CIBIqRXIkRqe'

export async function GET() {
  const results: Record<string, any> = {}

  results.env = {
    airtable:       !!process.env.AIRTABLE_API_KEY,
    anthropic:      !!process.env.ANTHROPIC_API_KEY,
    googleClient:   !!process.env.GOOGLE_CLIENT_ID,
    googleSecret:   !!process.env.GOOGLE_CLIENT_SECRET,
    googleRefresh:  !!process.env.GOOGLE_REFRESH_TOKEN,
    smtpEmail:      !!process.env.SMTP_EMAIL,
    smtpEmailVal:   process.env.SMTP_EMAIL || null,
    githubToken:    !!process.env.GITHUB_TOKEN,
    apolloKey:      !!process.env.APOLLO_API_KEY,
    discordWebhook: !!process.env.DISCORD_WEBHOOK_URL,
  }

  // Ping Airtable
  try {
    let leadsCount = 0, offset: string | undefined
    do {
      const qs = offset ? `pageSize=100&offset=${offset}` : 'pageSize=100'
      const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}?${qs}`, {
        headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error?.message || `HTTP ${r.status}`)
      leadsCount += (d.records || []).length
      offset = d.offset
    } while (offset)

    let logsCount = 0, logOffset: string | undefined
    do {
      const qs = logOffset ? `pageSize=100&offset=${logOffset}` : 'pageSize=100'
      const lr = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${LOG_TABLE}?${qs}`, {
        headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
      })
      const ld = await lr.json()
      logsCount += (ld.records || []).length
      logOffset = ld.offset
    } while (logOffset)

    results.airtable = { ok: true, leadsCount, logsCount }
  } catch (e: any) {
    results.airtable = { ok: false, error: e.message }
  }

  // Check GitHub rate limit
  try {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
    const r = await fetch('https://api.github.com/rate_limit', { headers })
    const d = await r.json()
    results.github = { ok: r.ok, remaining: d.rate?.remaining ?? 0, limit: d.rate?.limit ?? 60, authenticated: !!process.env.GITHUB_TOKEN }
  } catch (e: any) {
    results.github = { ok: false, error: e.message }
  }

  // Check Anthropic
  results.anthropic = { ok: !!process.env.ANTHROPIC_API_KEY }

  // Check Gmail API (replaces SMTP check)
  const gmailResult = await verifyGmail()
  results.gmail = { ok: gmailResult.ok, email: gmailResult.email || process.env.SMTP_EMAIL || null, error: gmailResult.error }

  const allOk = results.airtable.ok && results.anthropic.ok && results.gmail.ok
  return NextResponse.json({ ok: allOk, ...results, timestamp: new Date().toISOString() })
}

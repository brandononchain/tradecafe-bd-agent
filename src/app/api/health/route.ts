import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

const BASE_ID = 'appCYgmFc8vTfwyv1'
const LEADS_TABLE = 'tblAsQXKEK9chUaT6'
const LOG_TABLE = 'tbli5CIBIqRXIkRqe'

export async function GET() {
  const results: Record<string, any> = {}

  // Check which env vars are set
  results.env = {
    airtable:    !!process.env.AIRTABLE_API_KEY,
    anthropic:   !!process.env.ANTHROPIC_API_KEY,
    smtpEmail:   !!process.env.SMTP_EMAIL,
    smtpPass:    !!process.env.SMTP_PASSWORD,
    githubToken: !!process.env.GITHUB_TOKEN,
    smtpEmailVal: process.env.SMTP_EMAIL || null,
    hunterKey:      !!process.env.HUNTER_API_KEY,
    discordWebhook: !!process.env.DISCORD_WEBHOOK_URL,
  }

  // Ping Airtable and get real record counts via pagination
  try {
    // Count leads by paginating through all records
    let leadsCount = 0
    let offset: string | undefined
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

    // Count campaign log records
    let logsCount = 0
    let logOffset: string | undefined
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
    results.github = {
      ok: r.ok,
      remaining: d.rate?.remaining ?? 0,
      limit: d.rate?.limit ?? 60,
      authenticated: !!process.env.GITHUB_TOKEN,
    }
  } catch (e: any) {
    results.github = { ok: false, error: e.message }
  }

  // Check Anthropic
  results.anthropic = { ok: !!process.env.ANTHROPIC_API_KEY }

  // Check SMTP if credentials exist
  if (process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD) {
    try {
      const t = nodemailer.createTransport({
        host: 'imap.gmail.com', port: 587, secure: false,
        auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 8000,
      })
      await t.verify()
      t.close()
      results.smtp = { ok: true, email: process.env.SMTP_EMAIL }
    } catch (e: any) {
      results.smtp = { ok: false, error: e.message, email: process.env.SMTP_EMAIL }
    }
  } else {
    results.smtp = { ok: false, error: 'Credentials not configured', email: null }
  }

  const allOk = results.airtable.ok && results.anthropic.ok
  return NextResponse.json({ ok: allOk, ...results, timestamp: new Date().toISOString() })
}

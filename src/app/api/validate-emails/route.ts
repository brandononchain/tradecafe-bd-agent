import { NextRequest, NextResponse } from 'next/server'
import dns from 'dns/promises'

const PERSONAL_DOMAINS = new Set([
  'gmail.com','yahoo.com','hotmail.com','outlook.com','live.com',
  'icloud.com','me.com','mac.com','hey.com','proton.me','protonmail.com',
  'fastmail.com','zoho.com','aol.com','msn.com','ymail.com','inbox.com',
])
const ROLE_PREFIXES = new Set([
  'hello','info','contact','support','admin','noreply','no-reply',
  'team','sales','marketing','help','enquiries','enquiry','office',
  'mail','accounts','billing','legal','privacy',
])
const KNOWN_GOOD_DOMAINS = new Set([
  'google.com','microsoft.com','apple.com','amazon.com','github.com',
  'stripe.com','vercel.com','netlify.com','cloudflare.com',
])

export type EmailStatus = 'ready' | 'personal' | 'edu' | 'role' | 'missing' | 'invalid' | 'no_mx'

async function checkMX(domain: string): Promise<boolean> {
  // Skip DNS check for well-known domains (always valid)
  if (KNOWN_GOOD_DOMAINS.has(domain)) return true
  try {
    const records = await dns.resolveMx(domain)
    return records && records.length > 0
  } catch {
    return false
  }
}

async function checkEmail(
  email: string,
  verifyMX = false
): Promise<{ status: EmailStatus; reason: string; willSend: boolean; warning?: string }> {
  if (!email) return { status: 'missing', reason: 'No contact email', willSend: false }
  if (!email.includes('@') || !email.includes('.'))
    return { status: 'invalid', reason: 'Invalid email format', willSend: false }

  const [prefix, domain] = email.toLowerCase().split('@')
  if (!domain || !domain.includes('.'))
    return { status: 'invalid', reason: 'Invalid domain', willSend: false }

  if (PERSONAL_DOMAINS.has(domain))
    return { status: 'personal', reason: `Personal email (${domain}) — find a company address`, willSend: false }
  if (domain.endsWith('.edu'))
    return { status: 'edu', reason: 'Education address — not a business decision maker', willSend: false }

  const isRole = ROLE_PREFIXES.has(prefix)

  // MX record check — verify the domain can actually receive email
  if (verifyMX) {
    const hasMX = await checkMX(domain)
    if (!hasMX) {
      return {
        status: 'no_mx',
        reason: `Domain ${domain} has no MX records — email will bounce`,
        willSend: false,
      }
    }
  }

  if (isRole) {
    return {
      status: 'role',
      reason: `Role address (${prefix}@) — lower reply rates`,
      willSend: true,
      warning: 'Role address — consider finding a personal contact',
    }
  }

  return { status: 'ready', reason: 'Ready to send', willSend: true }
}

// Try to find a better email via Apollo.io when one is missing or invalid
async function apolloFallback(name: string, domain: string): Promise<string | null> {
  if (!process.env.APOLLO_API_KEY || !domain) return null
  try {
    const params: Record<string, string> = { domain, reveal_personal_emails: 'true' }
    if (name) {
      const parts = name.trim().split(/\s+/)
      if (parts.length >= 2) { params.first_name = parts[0]; params.last_name = parts.slice(1).join(' ') }
    }
    const qs = new URLSearchParams(params).toString()
    const r = await fetch(`https://api.apollo.io/api/v1/people/match?${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.APOLLO_API_KEY },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const data = await r.json()
    return data.person?.email || data.person?.personal_emails?.[0] || null
  } catch { return null }
}

export async function POST(req: NextRequest) {
  const { leads, verifyMX = true, tryApollo = true } = await req.json()
  if (!Array.isArray(leads))
    return NextResponse.json({ ok: false, error: 'leads array required' }, { status: 400 })

  const results = await Promise.all(leads.map(async (lead: any) => {
    let email = lead.contactEmail || ''
    let apolloEmail: string | null = null
    let apolloUsed = false

    // If missing or invalid, try Apollo.io
    if (tryApollo && (!email || !email.includes('@'))) {
      const website = lead.website || ''
      let domain: string | null = null
      try { domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, '') } catch {}
      if (domain) {
        apolloEmail = await apolloFallback(lead.contactName || '', domain)
        if (apolloEmail) { email = apolloEmail; apolloUsed = true }
      }
    }

    const check = await checkEmail(email, verifyMX)

    return {
      id:          lead.id,
      company:     lead.company,
      email:       email || null,
      originalEmail: lead.contactEmail || null,
      apolloEmail: apolloUsed ? apolloEmail : null,
      apolloUsed,
      ...check,
    }
  }))

  const summary = {
    total:     results.length,
    ready:     results.filter(r => r.status === 'ready').length,
    role:      results.filter(r => r.status === 'role').length,
    personal:  results.filter(r => r.status === 'personal').length,
    edu:       results.filter(r => r.status === 'edu').length,
    missing:   results.filter(r => r.status === 'missing').length,
    no_mx:     results.filter(r => r.status === 'no_mx').length,
    invalid:   results.filter(r => r.status === 'invalid').length,
    apolloFound: results.filter(r => r.apolloUsed).length,
    willSend:  results.filter(r => r.willSend).length,
    blocked:   results.filter(r => !r.willSend).length,
  }

  return NextResponse.json({ ok: true, results, summary })
}

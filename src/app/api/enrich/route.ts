import { NextRequest, NextResponse } from 'next/server'

// Multi-source email enrichment pipeline
// Priority: 1) Hunter.io domain search  2) Website scrape  3) GitHub profile  4) Pattern inference

const AT_BASE = 'appCYgmFc8vTfwyv1'
const AT_TABLE = 'tblAsQXKEK9chUaT6'

// ── Email extraction from raw text ──────────────────────────────────────────
function extractEmails(text: string): string[] {
  const raw = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || []
  const blocked = /noreply|no-reply|mailer-daemon|postmaster|abuse@|spam@|unsubscribe|donotreply|support@|info@|hello@|contact@/i
  return Array.from(new Set(raw.filter(e => !blocked.test(e) && !e.endsWith('.png') && !e.endsWith('.jpg'))))
}

// ── Website scrape for emails ───────────────────────────────────────────────
async function scrapeWebsite(url: string): Promise<{ emails: string[]; error?: string }> {
  if (!url) return { emails: [] }
  try {
    const target = url.startsWith('http') ? url : `https://${url}`
    // Try main page + common contact pages
    const pages = [target, `${target}/contact`, `${target}/about`, `${target}/team`]
    const allEmails: string[] = []

    for (const page of pages) {
      try {
        const r = await fetch(page, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TradeCafeBD/1.0)' },
          signal: AbortSignal.timeout(6000),
          redirect: 'follow',
        })
        if (!r.ok) continue
        const html = await r.text()
        // Extract emails from HTML (including mailto: links)
        const mailtos = html.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g) || []
        const fromMailto = mailtos.map(m => m.replace('mailto:', ''))
        allEmails.push(...fromMailto, ...extractEmails(html))
      } catch {}
    }

    return { emails: [...new Set(allEmails)] }
  } catch (e: any) {
    return { emails: [], error: e.message }
  }
}

// ── X/Twitter bio scrape ────────────────────────────────────────────────────
async function scrapeXBio(handle: string): Promise<{ emails: string[]; website?: string; bio?: string }> {
  if (!handle) return { emails: [] }
  const clean = handle.replace('@', '').replace('https://x.com/', '').replace('https://twitter.com/', '')
  try {
    // Use nitter instances or public profile page
    const urls = [
      `https://nitter.net/${clean}`,
      `https://nitter.privacydev.net/${clean}`,
    ]
    for (const url of urls) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TradeCafeBD/1.0)' },
          signal: AbortSignal.timeout(6000),
        })
        if (!r.ok) continue
        const html = await r.text()

        // Extract bio text
        const bioMatch = html.match(/class="profile-bio"[^>]*>([\s\S]*?)<\/p>/i)
        const bio = bioMatch ? bioMatch[1].replace(/<[^>]+>/g, '').trim() : ''

        // Extract website from profile
        const websiteMatch = html.match(/class="profile-website"[^>]*>[\s\S]*?href="([^"]+)"/i)
        const website = websiteMatch ? websiteMatch[1] : ''

        // Extract emails from bio
        const emails = extractEmails(bio + ' ' + html)

        return { emails, website, bio }
      } catch {}
    }
    return { emails: [] }
  } catch {
    return { emails: [] }
  }
}

// ── GitHub profile email ────────────────────────────────────────────────────
async function scrapeGitHub(org: string): Promise<{ emails: string[]; website?: string }> {
  if (!org) return { emails: [] }
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

  try {
    // Check org profile
    const orgR = await fetch(`https://api.github.com/orgs/${org}`, { headers, signal: AbortSignal.timeout(5000) })
    if (orgR.ok) {
      const data = await orgR.json()
      const emails = extractEmails((data.email || '') + ' ' + (data.bio || '') + ' ' + (data.description || ''))
      return { emails, website: data.blog || '' }
    }
    // Try as user
    const userR = await fetch(`https://api.github.com/users/${org}`, { headers, signal: AbortSignal.timeout(5000) })
    if (userR.ok) {
      const data = await userR.json()
      const emails: string[] = []
      if (data.email) emails.push(data.email)
      emails.push(...extractEmails((data.bio || '')))
      return { emails, website: data.blog || '' }
    }
    return { emails: [] }
  } catch {
    return { emails: [] }
  }
}

// ── Apollo.io people enrichment ─────────────────────────────────────────────
async function apolloLookup(opts: {
  name?: string; domain?: string; email?: string; linkedinUrl?: string; organizationName?: string
}): Promise<{ email?: string; firstName?: string; lastName?: string; position?: string; linkedinUrl?: string; phone?: string }> {
  const apiKey = process.env.APOLLO_API_KEY
  if (!apiKey) return {}

  try {
    // Build query params — Apollo matches better with more data
    const params: Record<string, string> = {
      reveal_personal_emails: 'true',
    }

    if (opts.email) params.email = opts.email
    if (opts.linkedinUrl) params.linkedin_url = opts.linkedinUrl
    if (opts.domain) params.domain = opts.domain
    if (opts.organizationName) params.organization_name = opts.organizationName

    if (opts.name) {
      const parts = opts.name.trim().split(/\s+/)
      if (parts.length >= 2) {
        params.first_name = parts[0]
        params.last_name = parts.slice(1).join(' ')
      } else {
        params.name = opts.name
      }
    }

    // Need at least one identifying field
    if (!params.email && !params.linkedin_url && !params.domain && !params.first_name) return {}

    const qs = new URLSearchParams(params).toString()
    const r = await fetch(`https://api.apollo.io/api/v1/people/match?${qs}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': apiKey,
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!r.ok) return {}
    const data = await r.json()
    const person = data.person

    if (!person) return {}

    // Extract best email — prefer work email, fall back to personal
    let bestEmail = ''
    if (person.email) {
      bestEmail = person.email
    } else if (person.personal_emails?.length) {
      bestEmail = person.personal_emails[0]
    }

    return {
      email: bestEmail || undefined,
      firstName: person.first_name || undefined,
      lastName: person.last_name || undefined,
      position: person.title || undefined,
      linkedinUrl: person.linkedin_url || undefined,
      phone: person.phone_numbers?.[0]?.sanitized_number || undefined,
    }
  } catch {
    return {}
  }
}

// ── Extract domain from URL ─────────────────────────────────────────────────
function getDomain(url: string): string {
  if (!url) return ''
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace('www.', '')
  } catch {
    return ''
  }
}

// ── Main handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { recordId, company, website, xHandle, githubOrg, contactName, linkedinUrl } = await req.json()

  const results: { source: string; email: string; confidence: string; name?: string; position?: string }[] = []
  let foundWebsite = website || ''

  try {
    // 1. X bio scrape — extract email + website from their X profile
    if (xHandle) {
      const xResult = await scrapeXBio(xHandle)
      if (xResult.website && !foundWebsite) foundWebsite = xResult.website
      for (const email of xResult.emails) {
        results.push({ source: 'x-bio', email, confidence: 'scraped' })
      }
    }

    // 2. Website scrape — find emails on their site
    if (foundWebsite) {
      const webResult = await scrapeWebsite(foundWebsite)
      for (const email of webResult.emails) {
        results.push({ source: 'website', email, confidence: 'scraped' })
      }
    }

    // 3. Apollo.io — people enrichment (275M+ contacts, free tier: 10K/mo)
    const domain = getDomain(foundWebsite)
    const apollo = await apolloLookup({
      name: contactName,
      domain: domain || undefined,
      linkedinUrl: linkedinUrl || undefined,
      organizationName: company || undefined,
    })
    if (apollo.email) {
      results.push({
        source: 'apollo',
        email: apollo.email,
        confidence: 'apollo-verified',
        name: [apollo.firstName, apollo.lastName].filter(Boolean).join(' '),
        position: apollo.position,
      })
    }

    // 4. GitHub profile email
    if (githubOrg) {
      const gh = await scrapeGitHub(githubOrg)
      if (gh.website && !foundWebsite) foundWebsite = gh.website
      for (const email of gh.emails) {
        results.push({ source: 'github', email, confidence: 'public' })
      }
      // If we found a website from GitHub and Apollo didn't have it, try Apollo with that domain
      if (gh.website && !domain) {
        const ghDomain = getDomain(gh.website)
        if (ghDomain) {
          const apolloGh = await apolloLookup({ name: contactName, domain: ghDomain })
          if (apolloGh.email) {
            results.push({ source: 'apollo-via-github', email: apolloGh.email, confidence: 'apollo-verified', name: [apolloGh.firstName, apolloGh.lastName].filter(Boolean).join(' '), position: apolloGh.position })
          }
        }
      }
    }

    // Dedupe results
    const seen = new Set<string>()
    const unique = results.filter(r => {
      const key = r.email.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Pick best email (Apollo > website > X bio > GitHub)
    const priorityOrder = ['apollo', 'apollo-via-github', 'website', 'x-bio', 'github']
    unique.sort((a, b) => priorityOrder.indexOf(a.source) - priorityOrder.indexOf(b.source))
    const best = unique[0]

    // Update CRM if we found an email and have a recordId
    if (best && recordId) {
      const updateFields: Record<string, any> = {
        'Contact Email': best.email,
        'Email Confidence': best.source.startsWith('apollo') ? 'Apollo verified' : best.source === 'github' ? 'GitHub public' : 'Pattern inferred',
      }
      if (best.name && !contactName) updateFields['Contact Name'] = best.name
      if (best.position) updateFields['Job Title'] = best.position
      if (foundWebsite) updateFields['Website'] = foundWebsite

      await fetch(`https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}/${recordId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: updateFields, typecast: true }),
      })
    }

    return NextResponse.json({
      ok: true,
      found: !!best,
      bestEmail: best?.email || null,
      bestSource: best?.source || null,
      bestConfidence: best?.confidence || null,
      contactName: best?.name || contactName || null,
      position: best?.position || null,
      website: foundWebsite || null,
      allResults: unique,
      totalFound: unique.length,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'

const GITHUB_API = 'https://api.github.com'

async function ghFetch(path: string, token?: string) {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'TradeCafeBDAgent/1.0',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${GITHUB_API}${path}`, { headers, next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${res.statusText}`)
  return res.json()
}

function computeLeadScore(d: {
  stars: number; forks: number; watchers: number; memberCount: number;
  contributors: number; repoCount: number; openIssues: number;
  hasEmail: boolean; hasWebsite: boolean
}): number {
  let s = 0
  s += Math.min(30, Math.round(Math.log10(d.stars + 1) * 10))
  s += Math.min(15, Math.round(Math.log10(d.forks + 1) * 6))
  if (d.memberCount >= 3) s += Math.min(15, Math.round(d.memberCount / 5))
  s += Math.min(15, Math.round(d.contributors / 2))
  s += Math.min(10, Math.round(Math.log10(d.watchers + 1) * 4))
  if (d.openIssues > 10) s += 5; else if (d.openIssues > 0) s += 2
  if (d.hasEmail) s += 5
  if (d.hasWebsite) s += 5
  return Math.min(100, s)
}

function emailPatterns(first: string, last: string, domain: string): string[] {
  const f = first.toLowerCase().replace(/[^a-z]/g, '')
  const l = last.toLowerCase().replace(/[^a-z]/g, '')
  if (!f || !domain) return []
  const p = [`${f}@${domain}`]
  if (l) p.push(`${f}.${l}@${domain}`, `${f}${l}@${domain}`, `${f[0]}${l}@${domain}`)
  return p
}

const PRIORITY_TITLES = ['cto','co-founder','cofounder','founder','ceo','head of trading','trader','portfolio manager','fund manager','head of growth','community lead','head of partnerships','bd lead','chief investment','managing partner','quantitative analyst','head of research']
const scoreBio = (bio: string) => PRIORITY_TITLES.filter(r => (bio || '').toLowerCase().includes(r)).length

// Try to find a GitHub org for a non-GitHub company by searching
async function findGitHubOrg(name: string, website: string, token?: string): Promise<string | null> {
  // Try extracting org from website first (e.g. github.com/orgname links)
  try {
    // Search GitHub for the org by company name
    const query = name.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/).slice(0, 3).join('+')
    const results = await ghFetch(`/search/users?q=${encodeURIComponent(name)}+type:org&per_page=3`, token)
    const orgs = (results.items || []).filter((u: any) => u.type === 'Organization')
    if (orgs.length > 0) return orgs[0].login
  } catch {}
  return null
}

// Extract domain from website URL
function extractDomain(website: string): string | null {
  if (!website) return null
  try {
    const u = new URL(website.startsWith('http') ? website : `https://${website}`)
    return u.hostname.replace(/^www\./, '')
  } catch { return null }
}

// Hunter.io enrichment
async function hunterEnrich(domain: string): Promise<{name:string;email:string;title:string;confidence:string} | null> {
  if (!process.env.HUNTER_API_KEY || !domain) return null
  try {
    const r = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=5&api_key=${process.env.HUNTER_API_KEY}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!r.ok) return null
    const d = await r.json()
    const emails = (d?.data?.emails || [])
      .filter((e: any) => e.value && e.confidence > 30)
      .map((e: any) => {
        let score = e.confidence || 0
        const pos = (e.position || '').toLowerCase()
        if (/cto|ceo|founder|vp|head|director|chief/.test(pos)) score += 30
        if (e.type === 'personal') score += 10
        return { ...e, score }
      })
      .sort((a: any, b: any) => b.score - a.score)

    const top = emails[0]
    if (!top) return null
    return {
      name:       [top.first_name, top.last_name].filter(Boolean).join(' '),
      email:      top.value,
      title:      top.position || '',
      confidence: `hunter-${top.confidence}`,
    }
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const sp      = new URL(req.url).searchParams
  const org     = sp.get('org')
  const token   = process.env.GITHUB_TOKEN
  const website = sp.get('website') || ''
  const name    = sp.get('name') || org || ''
  const type    = sp.get('type') || 'AI/ML Startup'
  const source  = sp.get('source') || 'github'  // github | yc | showhn | hackernews | linkedin

  if (org === 'ratelimit') {
    try {
      const data = await ghFetch('/rate_limit', token)
      return NextResponse.json({ ok: true, remaining: data.rate?.remaining, limit: data.rate?.limit })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message })
    }
  }

  if (!org) return NextResponse.json({ ok: false, error: 'org required' }, { status: 400 })

  const domain = extractDomain(website)

  // ── NON-GITHUB SOURCES: YC / Show HN / HN / LinkedIn ─────────────────────
  // For these, we don't have a reliable GitHub org slug.
  // Strategy: try to find GitHub org, fall back to Hunter.io only enrichment.
  if (source !== 'github') {
    let contact = null
    let githubData: any = null
    let githubOrgSlug: string | null = null

    // Try finding a GitHub org for this company
    try {
      githubOrgSlug = await findGitHubOrg(name, website, token)
    } catch {}

    // If found, fetch limited GitHub data
    if (githubOrgSlug) {
      try {
        const [orgData, repos] = await Promise.all([
          ghFetch(`/orgs/${githubOrgSlug}`, token).catch(() => null),
          ghFetch(`/orgs/${githubOrgSlug}/repos?sort=stars&per_page=5`, token).catch(() => []),
        ])
        if (orgData) {
          const stars      = repos.reduce((s: number, r: any) => s + (r.stargazers_count || 0), 0)
          const forks      = repos.reduce((s: number, r: any) => s + (r.forks_count || 0), 0)
          const topRepos   = repos.slice(0, 3).map((r: any) => r.name).join(', ')
          githubData = { stars, forks, topRepos, orgUrl: `https://github.com/${githubOrgSlug}` }

          // Try GitHub member email enrichment if we have GitHub data
          if (!contact) {
            const members = await ghFetch(`/orgs/${githubOrgSlug}/members?per_page=10`, token).catch(() => [])
            const profiles = await Promise.all(
              (members as any[]).slice(0, 5).map(async (m: any) => {
                const p = await ghFetch(`/users/${m.login}`, token).catch(() => null)
                if (!p) return null
                const parts = (p.name || m.login).trim().split(/\s+/)
                const verifiedEmail = p.email?.includes('@') ? p.email : null
                const inferredEmails = domain ? emailPatterns(parts[0] || '', parts.slice(1).join(' '), domain) : []
                return {
                  name:     p.name || m.login,
                  bio:      p.bio || '',
                  bioScore: scoreBio(p.bio || ''),
                  email:    verifiedEmail || inferredEmails[0] || null,
                  confidence: verifiedEmail ? 'verified' : inferredEmails.length ? 'inferred' : null,
                }
              })
            )
            const valid = profiles.filter((p: any) => p?.email)
              .sort((a: any, b: any) => b.bioScore - a.bioScore)
            if (valid[0]) {
              contact = { name: valid[0].name, email: valid[0].email, title: valid[0].bio?.split('\n')[0]?.slice(0, 80) || '', confidence: valid[0].confidence }
            }
          }
        }
      } catch {}
    }

    // Hunter.io enrichment (primary for non-GitHub sources)
    if (!contact && domain) {
      contact = await hunterEnrich(domain)
    }

    const leadScore = githubData
      ? computeLeadScore({
          stars: githubData.stars, forks: githubData.forks, watchers: 0,
          memberCount: 5, contributors: 5, repoCount: 5,
          openIssues: 0, hasEmail: !!contact, hasWebsite: !!website
        })
      : Math.min(100, 25 + (contact ? 20 : 0) + (website ? 10 : 0))

    return NextResponse.json({
      ok: true,
      data: {
        company:      name,
        website:      website || '',
        description:  '',
        githubOrgUrl: githubData?.orgUrl || (githubOrgSlug ? `https://github.com/${githubOrgSlug}` : ''),
        companyType:  type,
        githubStars:  githubData?.stars || 0,
        githubForks:  githubData?.forks || 0,
        githubWatchers: 0,
        orgMembers:   0,
        contributors: 0,
        openIssues:   0,
        repoCount:    0,
        topRepos:     githubData?.topRepos || '',
        aiTools:      '',
        leadScore,
        contactName:  contact?.name || null,
        contactEmail: contact?.email || null,
        contactTitle: contact?.title || null,
        contactConfidence: contact?.confidence || null,
        contactGithub: null,
      }
    })
  }

  // ── GITHUB SOURCE: full enrichment ───────────────────────────────────────
  try {
    const [orgData, repos, members] = await Promise.all([
      ghFetch(`/orgs/${org}`, token),
      ghFetch(`/orgs/${org}/repos?sort=stars&per_page=5`, token),
      ghFetch(`/orgs/${org}/members?per_page=30`, token).catch(() => []),
    ])

    const stars      = repos.reduce((s: number, r: any) => s + (r.stargazers_count || 0), 0)
    const forks      = repos.reduce((s: number, r: any) => s + (r.forks_count || 0), 0)
    const watchers   = repos.reduce((s: number, r: any) => s + (r.watchers_count || 0), 0)
    const openIssues = repos.reduce((s: number, r: any) => s + (r.open_issues_count || 0), 0)
    const topRepoNames = repos.slice(0, 3).map((r: any) => r.name).join(', ')
    const topics = repos.flatMap((r: any) => r.topics || [])
    const aiTools = Array.from(new Set(topics.filter((t: string) =>
      ['ai','llm','agent','ml','gpt','claude','langchain','openai','rag','vector'].some(k => t.includes(k))
    ))).slice(0, 8).join(', ')

    const topRepo = repos[0]
    let contributors = members.length || 0
    if (topRepo) {
      try {
        const contrib = await ghFetch(`/repos/${org}/${topRepo.name}/contributors?per_page=30&anon=false`, token)
        contributors = Array.isArray(contrib) ? contrib.length : contributors
      } catch {}
    }

    // GitHub member email enrichment
    let bestContact: any = null
    if (members?.length > 0) {
      const effectiveDomain = domain || extractDomain(orgData.blog || '')
      const profiles = await Promise.all(
        (members as any[]).slice(0, 10).map(async (m: any) => {
          const p = await ghFetch(`/users/${m.login}`, token).catch(() => null)
          if (!p) return null
          const parts = (p.name || m.login).trim().split(/\s+/)
          const verifiedEmail  = p.email?.includes('@') ? p.email : null
          const inferredEmails = effectiveDomain ? emailPatterns(parts[0] || '', parts.slice(1).join(' '), effectiveDomain) : []
          return {
            name:      p.name || m.login, bio: p.bio || '',
            bioScore:  scoreBio(p.bio || ''), followers: p.followers || 0,
            githubUrl: p.html_url,
            email:     verifiedEmail || inferredEmails[0] || null,
            confidence: verifiedEmail ? 'verified' : inferredEmails.length ? 'inferred' : null,
          }
        })
      )
      const valid = profiles.filter((p: any) => p?.email)
        .sort((a: any, b: any) => (b.bioScore - a.bioScore) || (b.followers - a.followers))
      if (valid[0]) {
        bestContact = {
          name: valid[0].name, email: valid[0].email,
          confidence: valid[0].confidence,
          title: valid[0].bio?.split('\n')[0]?.slice(0, 80) || '',
          githubUrl: valid[0].githubUrl,
        }
      }
    }

    // Org contact fallback
    if (!bestContact && orgData.email) {
      bestContact = { name: orgData.name || org, email: orgData.email, confidence: 'verified', title: 'Organization contact', githubUrl: `https://github.com/${org}` }
    }

    // Hunter.io fallback
    const effectiveDomain = domain || extractDomain(orgData.blog || '')
    if (!bestContact?.email && effectiveDomain) {
      const h = await hunterEnrich(effectiveDomain)
      if (h) bestContact = { ...h, githubUrl: `https://github.com/${org}` }
    }

    const leadScore = computeLeadScore({
      stars, forks, watchers,
      memberCount:  Array.isArray(members) ? members.length : 0,
      contributors,
      repoCount:    orgData.public_repos || repos.length,
      openIssues,
      hasEmail:     !!bestContact?.email,
      hasWebsite:   !!(orgData.blog || website),
    })

    return NextResponse.json({
      ok: true,
      data: {
        company:      orgData.name || name || org,
        website:      orgData.blog || website || `https://github.com/${org}`,
        description:  orgData.description || '',
        githubOrgUrl: `https://github.com/${org}`,
        companyType:  type,
        githubStars:  stars, githubForks: forks, githubWatchers: watchers,
        orgMembers:   Array.isArray(members) ? members.length : 0,
        contributors, openIssues,
        repoCount:    orgData.public_repos || repos.length,
        topRepos:     topRepoNames,
        aiTools:      aiTools || '',
        leadScore,
        contactName:  bestContact?.name || null,
        contactEmail: bestContact?.email || null,
        contactTitle: bestContact?.title || null,
        contactConfidence: bestContact?.confidence || null,
        contactGithub: bestContact?.githubUrl || null,
      }
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

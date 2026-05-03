import { NextRequest, NextResponse } from 'next/server'
import { buildLIKeywords } from '@/lib/topics'

// LinkedIn lead gen via Proxycurl API
// https://nubela.co/proxycurl — $0.01/profile, 10 free credits on signup
// Set PROXYCURL_API_KEY in Vercel env vars to enable this source
const PROXYCURL_KEY = () => process.env.PROXYCURL_API_KEY

const SKIP = new Set([
  'google','microsoft','amazon','apple','meta','netflix','uber','airbnb',
  'salesforce','oracle','ibm','intel','nvidia','openai','anthropic',
])

// AI/ML company keywords for filtering LI search results
const AI_KEYWORDS = [
  'cryptocurrency', 'crypto trading', 'bitcoin', 'blockchain', 'defi',
  'decentralized finance', 'trading platform', 'algorithmic trading',
  'forex', 'quantitative trading', 'digital assets', 'web3',
  'trading signals', 'crypto exchange', 'token', 'staking',
  'yield', 'liquidity', 'smart contract', 'wallet',
  'nft', 'metaverse', 'fintech', 'prop trading',
]

interface ProxycurlCompany {
  name: string
  linkedin_internal_id: string
  universal_name_id: string
  website: string
  tagline: string
  description: string
  company_size: [number, number] | null
  industry: string
  specialities: string[]
  hq: { city: string; country: string } | null
  follower_count: number
}

async function searchLinkedInCompanies(keyword: string): Promise<ProxycurlCompany[]> {
  const key = PROXYCURL_KEY()
  if (!key) return []

  try {
    const params = new URLSearchParams({
      keyword_name: keyword,
      page_size: '10',
    })
    const r = await fetch(`https://nubela.co/proxycurl/api/search/company?${params}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return []
    const d = await r.json()
    return d.results || []
  } catch {
    return []
  }
}

async function getCompanyProfile(linkedinUrl: string): Promise<any> {
  const key = PROXYCURL_KEY()
  if (!key) return null

  try {
    const params = new URLSearchParams({ url: linkedinUrl, extra: 'include', use_cache: 'if-present' })
    const r = await fetch(`https://nubela.co/proxycurl/api/linkedin/company?${params}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return null
    return r.json()
  } catch {
    return null
  }
}

function scoreLinkedInCompany(co: any): number {
  const size       = co.company_size?.[0] || co.staff_count || 0
  const followers  = co.follower_count || 0
  const hasWebsite = co.website ? 15 : 0
  const sizeScore  = size > 0 && size < 200 ? 20 : size >= 200 ? 10 : 0 // prefer SMBs
  const follScore  = Math.min(Math.log10(Math.max(followers, 1)) * 8, 25)
  return Math.min(100, Math.round(follScore + sizeScore + hasWebsite + 20))
}

export async function GET(req: NextRequest) {
  const key = PROXYCURL_KEY()

  if (!key) {
    return NextResponse.json({
      ok: false,
      error: 'PROXYCURL_API_KEY not configured',
      setup: 'Sign up at https://nubela.co/proxycurl (10 free credits) and add PROXYCURL_API_KEY to Vercel env vars',
    }, { status: 400 })
  }

  try {
    // Load CRM names to dedupe
    const crmNames = new Set<string>()
    try {
      const at = await fetch(
        `https://api.airtable.com/v0/appCYgmFc8vTfwyv1/tblAsQXKEK9chUaT6?pageSize=200&fields[]=Company`,
        { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
      ).then(r => r.json())
      for (const rec of at.records || []) {
        if (rec.fields['Company']) crmNames.add(rec.fields['Company'].toLowerCase())
      }
    } catch {}

    // Search for AI companies on LinkedIn
    const topicsParam = new URL(req.url).searchParams.get('topics') || ''
    const topicIds    = topicsParam ? topicsParam.split(',').filter(Boolean) : []
    const searches    = buildLIKeywords(topicIds)

    const seen  = new Set<string>()
    const orgs: any[] = []

    for (const keyword of searches) {
      const results = await searchLinkedInCompanies(keyword)

      for (const co of results) {
        const name = co.name || ''
        const key  = name.toLowerCase().trim()

        if (!name || seen.has(key)) continue
        seen.add(key)

        if (Array.from(SKIP).some(s => key.includes(s))) continue
        if (crmNames.has(key)) continue

        // Check if it's an AI company
        const desc = (co.description || co.tagline || '').toLowerCase()
        const isAI = AI_KEYWORDS.some(kw => desc.includes(kw)) ||
          (co.specialities || []).some((s: string) =>
            AI_KEYWORDS.some(kw => s.toLowerCase().includes(kw))
          )

        if (!isAI) continue

        const liUrl = co.universal_name_id
          ? `https://www.linkedin.com/company/${co.universal_name_id}`
          : ''

        orgs.push({
          source:      'linkedin',
          org:         name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(),
          name,
          type:        'AI/ML Startup',
          website:     co.website || '',
          url:         liUrl,
          tagline:     co.tagline || '',
          description: (co.description || '').slice(0, 300),
          industry:    co.industry || '',
          location:    co.hq ? `${co.hq.city}, ${co.hq.country}` : '',
          followers:   co.follower_count || 0,
          companySize: co.company_size?.[0] || 0,
          score:       scoreLinkedInCompany(co),
          linkedinUrl: liUrl,
        })
      }
    }

    orgs.sort((a, b) => b.score - a.score)

    return NextResponse.json({ ok: true, orgs: orgs.slice(0, 40), total: orgs.length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

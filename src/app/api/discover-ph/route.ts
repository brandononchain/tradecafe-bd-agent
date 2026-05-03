import { NextRequest, NextResponse } from 'next/server'
import { buildTopicTags } from '@/lib/topics'

// Y Combinator Companies API — fully public, no auth needed
// Perfect ICP: funded AI startups, active teams, verified websites
const YC_API = 'https://api.ycombinator.com/v0.1/companies'

// Also mines HN "Show HN" posts for new products
const HN_SEARCH = 'https://hn.algolia.com/api/v1/search'

const SKIP = new Set([
  'google','microsoft','amazon','apple','meta','netflix','uber','airbnb',
  'stripe','twilio','salesforce','oracle','ibm','intel','openai','anthropic',
])

const AI_TAGS = new Set([
  'Artificial Intelligence','Machine Learning','AI','Developer Tools',
  'NLP','Computer Vision','Generative AI','LLM','AI Assistant',
  'Robotics','Data Science','MLOps','AI Infrastructure','Fintech',
  'Crypto / Web3','B2B','SaaS',
])

function scoreYCCompany(co: any, topicTags: string[]): number {
  const teamSize  = co.teamSize || 0
  const isHiring  = co.badges?.includes('isHiring') ? 10 : 0
  const hasWeb    = co.website ? 10 : 0
  const tagBonus  = topicTags.length > 0
    ? co.tags?.filter((t: string) => topicTags.some(tt => t.toLowerCase().includes(tt.toLowerCase()))).length * 8
    : 0
  const sizeScore = teamSize > 0 && teamSize < 50 ? 20 : teamSize < 200 ? 12 : 5
  return Math.min(100, 30 + sizeScore + isHiring + hasWeb + Math.min(tagBonus, 25))
}

export async function GET(req: NextRequest) {
  const sp        = new URL(req.url).searchParams
  const topicsParam = sp.get('topics') || ''
  const topicIds    = topicsParam ? topicsParam.split(',').filter(Boolean) : []
  const topicTags   = buildTopicTags(topicIds)

  try {
    // Load CRM to dedupe
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

    const seen = new Set<string>()
    const orgs: any[] = []

    // ── Source 1: YC Companies (recent batches) ──────────────────────
    const batches = ['W25', 'S24', 'W24', 'S23', 'W23']
    const ycTags  = topicTags.length > 0 ? topicTags : ['AI','Artificial Intelligence','Machine Learning','Developer Tools']

    for (const batch of batches) {
      for (const tag of ycTags.slice(0, 4)) {
        try {
          const params = new URLSearchParams({ batch, tags: tag })
          const r = await fetch(`${YC_API}?${params}`, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000),
          })
          if (!r.ok) continue
          const d = await r.json()
          const companies = d.companies || []

          for (const co of companies) {
            const name = co.name || ''
            const key  = name.toLowerCase().trim()
            if (!name || seen.has(key) || crmNames.has(key)) continue
            if (Array.from(SKIP).some(s => key.includes(s))) continue
            seen.add(key)

            orgs.push({
              source:      'yc',
              org:         co.slug || key.replace(/[^a-z0-9]/g, '-'),
              name,
              type:        co.industries?.[0] || 'AI/ML Startup',
              website:     co.website || '',
              url:         co.url || `https://www.ycombinator.com/companies/${co.slug}`,
              tagline:     co.oneLiner || '',
              description: co.longDescription?.slice(0, 300) || co.oneLiner || '',
              batch:       co.batch || '',
              teamSize:    co.teamSize || 0,
              location:    co.locations?.[0] || '',
              tags:        co.tags || [],
              isHiring:    co.badges?.includes('isHiring') || false,
              score:       scoreYCCompany(co, topicTags),
            })
          }
        } catch { continue }
      }
    }

    // ── Source 2: HN "Show HN" posts ────────────────────────────────
    const showQueries = topicTags.length > 0
      ? topicTags.slice(0, 3).map(t => `Show HN ${t}`)
      : ['Show HN AI agent', 'Show HN LLM', 'Show HN AI tool']

    for (const q of showQueries) {
      try {
        const r = await fetch(
          `${HN_SEARCH}?query=${encodeURIComponent(q)}&tags=show_hn&hitsPerPage=15`,
          { signal: AbortSignal.timeout(6000) }
        ).then(r => r.json())

        for (const hit of r.hits || []) {
          const title = (hit.title || '').replace(/^Show HN:\s*/i, '').trim()
          const key   = title.toLowerCase().trim()
          if (!title || key.length < 3 || seen.has(key) || crmNames.has(key)) continue
          if (Array.from(SKIP).some(s => key.includes(s))) continue
          seen.add(key)

          const website = hit.url || ''
          const domain  = website ? new URL(website).hostname.replace(/^www\./, '') : ''

          orgs.push({
            source:      'showhn',
            org:         key.replace(/[^a-z0-9]/g, '-').slice(0, 40),
            name:        title.slice(0, 60),
            type:        'AI/ML Startup',
            website,
            url:         `https://news.ycombinator.com/item?id=${hit.objectID}`,
            tagline:     `HN points: ${hit.points || 0} · ${domain}`,
            description: hit.title || '',
            score:       Math.min(100, 25 + Math.min(Math.log10(Math.max(hit.points || 1, 1)) * 15, 40)),
          })
        }
      } catch { continue }
    }

    orgs.sort((a, b) => b.score - a.score)

    return NextResponse.json({ ok: true, orgs: orgs.slice(0, 50), total: orgs.length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

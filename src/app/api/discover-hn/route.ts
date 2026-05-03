import { NextRequest, NextResponse } from 'next/server'
import { buildHNKeywords } from '@/lib/topics'

// HN Algolia API — fully public, no auth
const HN_SEARCH = 'https://hn.algolia.com/api/v1'

const AI_KEYWORDS = [
  'ai', 'ml', 'llm', 'gpt', 'agent', 'machine learning', 'artificial intelligence',
  'nlp', 'embedding', 'vector', 'rag', 'langchain', 'openai', 'anthropic',
  'computer vision', 'deep learning', 'inference', 'model', 'generative',
  'autonomous', 'copilot', 'foundation model', 'fine-tun', 'transformer',
]

const SKIP_COMPANIES = new Set([
  'google', 'microsoft', 'amazon', 'apple', 'meta', 'netflix', 'uber',
  'airbnb', 'salesforce', 'oracle', 'ibm', 'intel', 'nvidia',
])

function extractCompanyFromPost(text: string): string {
  // HN job posts typically start with "Company Name | Role | Location | Remote"
  const firstLine = text.split('\n')[0] || text.slice(0, 200)
  const pipeMatch = firstLine.match(/^([^|]+)\|/)
  if (pipeMatch) return pipeMatch[1].trim()
  // Or "We are Company" / "At Company"
  const weAreMatch = text.match(/(?:We are|We're|At) ([A-Z][A-Za-z0-9\s\.]+?)[\.,\s]/)?.[1]
  if (weAreMatch) return weAreMatch.trim()
  // Fallback: first capitalized word sequence
  return firstLine.slice(0, 40).trim()
}

function extractWebsite(text: string): string {
  const urlMatch = text.match(/https?:\/\/(?:www\.)?([a-zA-Z0-9\-]+\.[a-zA-Z]{2,})/)?.[0] || ''
  // Skip HN links
  if (urlMatch.includes('ycombinator') || urlMatch.includes('news.ycomb')) return ''
  return urlMatch
}

function isAICompany(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some(kw => lower.includes(kw))
}

function scoreHNPost(post: any, text: string): number {
  const hasWebsite = extractWebsite(text) ? 15 : 0
  const aiScore   = AI_KEYWORDS.filter(kw => text.toLowerCase().includes(kw)).length
  const points    = Math.min(post.points || 0, 100)
  return Math.min(100, Math.round(
    Math.log10(Math.max(points, 1)) * 10 +
    Math.min(aiScore * 8, 40) +
    hasWebsite +
    20 // base for being on HN hiring
  ))
}

export async function GET(req: NextRequest) {
  try {
    // Load CRM names
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

    // Find recent "Ask HN: Who is hiring?" threads
    const searchResp = await fetch(
      `${HN_SEARCH}/search?query=Ask+HN+Who+is+hiring&tags=story,ask_hn&hitsPerPage=5&attributesToRetrieve=objectID,title,created_at`,
      { signal: AbortSignal.timeout(8000) }
    ).then(r => r.json())

    const threads = (searchResp.hits || [])
      .filter((h: any) => h.title?.toLowerCase().includes('who is hiring'))
      .slice(0, 2) // last 2 months

    if (!threads.length) {
      return NextResponse.json({ ok: true, orgs: [], total: 0, note: 'No HN hiring threads found' })
    }

    const topicsParam = new URL(req.url).searchParams.get('topics') || ''
    const topicIds    = topicsParam ? topicsParam.split(',').filter(Boolean) : []
    const hnKeywords  = buildHNKeywords(topicIds)
    const seen        = new Set<string>()
    const orgs: any[] = []

    for (const thread of threads) {
      // Get comments from thread
      const commentsResp = await fetch(
        `${HN_SEARCH}/search?tags=comment,story_${thread.objectID}&hitsPerPage=100&attributesToRetrieve=comment_text,objectID,created_at`,
        { signal: AbortSignal.timeout(10000) }
      ).then(r => r.json())

      const comments = commentsResp.hits || []

      for (const comment of comments) {
        const text = comment.comment_text || ''
        if (!text || text.length < 50) continue

        // Only AI companies
        if (!isAICompany(text, hnKeywords)) continue

        const company = extractCompanyFromPost(text)
        if (!company || company.length < 2) continue

        const key = company.toLowerCase().trim()
        if (seen.has(key)) continue
        seen.add(key)

        if (Array.from(SKIP_COMPANIES).some(s => key.includes(s))) continue
        if (crmNames.has(key)) continue

        const website = extractWebsite(text)
        const score   = scoreHNPost(comment, text)
        const aiScore2 = hnKeywords.filter(kw => text.toLowerCase().includes(kw)).length

        orgs.push({
          source:      'hackernews',
          org:         company.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(),
          name:        company,
          type:        'AI/ML Startup',
          website,
          url:         `https://news.ycombinator.com/item?id=${comment.objectID}`,
          description: text.slice(0, 300).replace(/<[^>]+>/g, '').trim(),
          tagline:     text.slice(0, 100).replace(/<[^>]+>/g, '').trim(),
          createdAt:   comment.created_at || '',
          score,
          hnThread:    thread.title,
        })
      }
    }

    // Sort by score
    orgs.sort((a, b) => b.score - a.score)

    return NextResponse.json({ ok: true, orgs: orgs.slice(0, 40), total: orgs.length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

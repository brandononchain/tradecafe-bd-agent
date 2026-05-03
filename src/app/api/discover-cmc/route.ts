import { NextRequest, NextResponse } from 'next/server'

// CoinMarketCap API — requires CMC_API_KEY (free tier: 10,000 calls/month)
// Discovers trending tokens, recently added, and gainers

const CMC = 'https://pro-api.coinmarketcap.com/v1'

async function cmcFetch(path: string) {
  const key = process.env.CMC_API_KEY
  if (!key) throw new Error('CMC_API_KEY not configured')
  const r = await fetch(`${CMC}${path}`, {
    headers: { 'X-CMC_PRO_API_KEY': key, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 300 },
  })
  if (!r.ok) throw new Error(`CMC ${r.status}`)
  return r.json()
}

export async function GET(req: NextRequest) {
  const { searchParams: sp } = new URL(req.url)
  const mode = sp.get('mode') || 'trending' // trending | new | gainers

  const key = process.env.CMC_API_KEY
  if (!key) {
    return NextResponse.json({
      ok: false,
      error: 'CMC_API_KEY not configured',
      setup: 'Sign up at https://coinmarketcap.com/api — free tier: 10,000 calls/month. Add CMC_API_KEY to Vercel env vars.',
    }, { status: 400 })
  }

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

    const orgs: any[] = []
    const seen = new Set<string>()

    if (mode === 'trending') {
      const data = await cmcFetch('/cryptocurrency/trending/latest?limit=50')
      for (const coin of data.data || []) {
        const name = coin.name || ''
        const key = name.toLowerCase()
        if (!name || seen.has(key) || crmNames.has(key)) continue
        seen.add(key)

        orgs.push({
          source: 'coinmarketcap',
          org: coin.slug || key.replace(/[^a-z0-9]/g, '-'),
          name,
          type: 'Trending (CMC)',
          website: '',
          url: `https://coinmarketcap.com/currencies/${coin.slug}`,
          description: `${coin.symbol} — Trending on CMC · Rank #${coin.cmc_rank || '?'}`,
          score: Math.min(100, Math.round(coin.cmc_rank ? Math.max(0, 100 - coin.cmc_rank / 10) : 50)),
          followers: coin.cmc_rank || 0,
          symbol: coin.symbol || '',
        })
      }
    }

    if (mode === 'new') {
      const data = await cmcFetch('/cryptocurrency/listings/new?limit=50')
      for (const coin of data.data || []) {
        const name = coin.name || ''
        const key = name.toLowerCase()
        if (!name || seen.has(key) || crmNames.has(key)) continue
        seen.add(key)

        orgs.push({
          source: 'coinmarketcap',
          org: coin.slug || key.replace(/[^a-z0-9]/g, '-'),
          name,
          type: 'New Listing (CMC)',
          website: '',
          url: `https://coinmarketcap.com/currencies/${coin.slug}`,
          description: `${coin.symbol} — Newly listed on CMC · Added ${coin.date_added?.split('T')[0] || 'recently'}`,
          score: 60,
          followers: 0,
          symbol: coin.symbol || '',
        })
      }
    }

    if (mode === 'gainers') {
      const data = await cmcFetch('/cryptocurrency/trending/gainers-losers?limit=50&sort_dir=desc')
      for (const coin of data.data || []) {
        const name = coin.name || ''
        const key = name.toLowerCase()
        if (!name || seen.has(key) || crmNames.has(key)) continue
        seen.add(key)

        const change = coin.quote?.USD?.percent_change_24h || 0

        orgs.push({
          source: 'coinmarketcap',
          org: coin.slug || key.replace(/[^a-z0-9]/g, '-'),
          name,
          type: change > 20 ? 'Top Gainer (CMC)' : 'Gainer (CMC)',
          website: '',
          url: `https://coinmarketcap.com/currencies/${coin.slug}`,
          description: `${coin.symbol} — ${change > 0 ? '+' : ''}${change.toFixed(1)}% 24h · Price: $${coin.quote?.USD?.price?.toFixed(4) || '?'}`,
          score: Math.min(100, Math.round(40 + change)),
          followers: coin.cmc_rank || 0,
          symbol: coin.symbol || '',
        })
      }
    }

    orgs.sort((a, b) => b.score - a.score)

    return NextResponse.json({ ok: true, orgs: orgs.slice(0, 50), total: orgs.length, mode })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

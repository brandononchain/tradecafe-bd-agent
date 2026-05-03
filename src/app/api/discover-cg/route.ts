import { NextRequest, NextResponse } from 'next/server'

// CoinGecko free API — no auth needed, 30 req/min
// Discovers trending coins + top gainers → maps to projects/teams as leads

const CG = 'https://api.coingecko.com/api/v3'

async function cgFetch(path: string) {
  const r = await fetch(`${CG}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 300 },
  })
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`)
  return r.json()
}

export async function GET(req: NextRequest) {
  const { searchParams: sp } = new URL(req.url)
  const mode = sp.get('mode') || 'trending' // trending | gainers | category

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
      const data = await cgFetch('/search/trending')
      for (const item of data.coins || []) {
        const coin = item.item || item
        const name = coin.name || ''
        const key = name.toLowerCase()
        if (!name || seen.has(key) || crmNames.has(key)) continue
        seen.add(key)

        orgs.push({
          source: 'coingecko',
          org: coin.id || key.replace(/[^a-z0-9]/g, '-'),
          name,
          type: 'Trending Coin',
          website: '',
          url: `https://www.coingecko.com/en/coins/${coin.id}`,
          description: `${coin.symbol?.toUpperCase() || ''} — Rank #${coin.market_cap_rank || '?'}. Trending on CoinGecko.`,
          score: Math.min(100, Math.round((coin.market_cap_rank ? Math.max(0, 100 - coin.market_cap_rank / 5) : 40) + (coin.score || 0) * 5)),
          followers: coin.market_cap_rank || 0,
          symbol: coin.symbol?.toUpperCase() || '',
        })
      }
    }

    if (mode === 'gainers') {
      // Top gainers by 24h price change
      const data = await cgFetch('/coins/markets?vs_currency=usd&order=price_change_percentage_24h_desc&per_page=50&page=1&sparkline=false')
      for (const coin of data || []) {
        const name = coin.name || ''
        const key = name.toLowerCase()
        if (!name || seen.has(key) || crmNames.has(key)) continue
        seen.add(key)

        const priceChange = coin.price_change_percentage_24h || 0

        orgs.push({
          source: 'coingecko',
          org: coin.id || key.replace(/[^a-z0-9]/g, '-'),
          name,
          type: priceChange > 20 ? 'Top Gainer' : priceChange > 5 ? 'Gainer' : 'Active Coin',
          website: '',
          url: `https://www.coingecko.com/en/coins/${coin.id}`,
          description: `${coin.symbol?.toUpperCase()} — $${coin.current_price?.toLocaleString()} · ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}% 24h · MCap: $${(coin.market_cap / 1e6).toFixed(0)}M`,
          score: Math.min(100, Math.round(40 + priceChange * 1.5)),
          followers: coin.market_cap_rank || 0,
          symbol: coin.symbol?.toUpperCase() || '',
          marketCap: coin.market_cap,
          priceChange24h: priceChange,
        })
      }
    }

    if (mode === 'category') {
      const category = sp.get('cat') || 'decentralized-finance-defi'
      const data = await cgFetch(`/coins/markets?vs_currency=usd&category=${category}&order=market_cap_desc&per_page=50&page=1`)
      for (const coin of data || []) {
        const name = coin.name || ''
        const key = name.toLowerCase()
        if (!name || seen.has(key) || crmNames.has(key)) continue
        seen.add(key)

        orgs.push({
          source: 'coingecko',
          org: coin.id || key.replace(/[^a-z0-9]/g, '-'),
          name,
          type: 'DeFi Protocol',
          website: '',
          url: `https://www.coingecko.com/en/coins/${coin.id}`,
          description: `${coin.symbol?.toUpperCase()} — MCap: $${(coin.market_cap / 1e6).toFixed(0)}M · Vol: $${((coin.total_volume || 0) / 1e6).toFixed(0)}M/24h`,
          score: Math.min(100, Math.round(30 + Math.log10(coin.market_cap || 1) * 5)),
          followers: coin.market_cap_rank || 0,
          symbol: coin.symbol?.toUpperCase() || '',
          marketCap: coin.market_cap,
        })
      }
    }

    orgs.sort((a, b) => b.score - a.score)

    return NextResponse.json({ ok: true, orgs: orgs.slice(0, 50), total: orgs.length, mode })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

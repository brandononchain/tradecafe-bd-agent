import { NextRequest, NextResponse } from 'next/server'

// TradingView idea scraping — finds popular trading idea authors
// No API key needed — uses public endpoints

export async function GET(req: NextRequest) {
  try {
    // Load CRM to dedupe
    const crmNames = new Set<string>()
    try {
      const at = await fetch(
        `https://api.airtable.com/v0/appCYgmFc8vTfwyv1/tblAsQXKEK9chUaT6?pageSize=200&fields[]=Company&fields[]=Platform Handle`,
        { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
      ).then(r => r.json())
      for (const rec of at.records || []) {
        const name = rec.fields['Company'] || rec.fields['Platform Handle'] || ''
        if (name) crmNames.add(name.toLowerCase())
      }
    } catch {}

    // TradingView public data endpoint for popular crypto ideas
    const symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD', 'XRPUSD', 'DOTUSD', 'ADAUSD', 'AVAXUSD', 'LINKUSD', 'MATICUSD']
    const orgs: any[] = []
    const seen = new Set<string>()

    // Fetch trending ideas via TradingView's public search
    for (const symbol of symbols.slice(0, 5)) {
      try {
        const r = await fetch(`https://www.tradingview.com/symbols/${symbol}/ideas/?sort=popular`, {
          headers: { 'User-Agent': 'TradeCafeBDAgent/1.0' },
          signal: AbortSignal.timeout(8000),
        })
        const html = await r.text()

        // Extract author usernames from idea pages
        const authorMatches = html.match(/"username":"([^"]+)"/g) || []
        for (const match of authorMatches.slice(0, 10)) {
          const username = match.replace(/"username":"/g, '').replace(/"/g, '')
          const key = username.toLowerCase()
          if (!username || seen.has(key) || crmNames.has(key)) continue
          seen.add(key)

          orgs.push({
            source: 'tradingview',
            org: key,
            name: username,
            type: 'TradingView Author',
            website: `https://www.tradingview.com/u/${username}`,
            url: `https://www.tradingview.com/u/${username}`,
            description: `Active idea publisher on ${symbol} · TradingView analyst`,
            score: 55,
            followers: 0,
          })
        }
      } catch {}
    }

    // Also add well-known crypto TradingView analysts as static targets
    const knownAnalysts = [
      { name: 'CryptoBullet', desc: 'Popular BTC/ETH analyst, technical analysis focus', score: 75 },
      { name: 'TradingShot', desc: 'Multi-timeframe crypto analysis, pattern recognition', score: 70 },
      { name: 'Alecryptoes', desc: 'Crypto swing trader, altcoin analysis', score: 65 },
      { name: 'Bixley', desc: 'BTC dominance analysis, macro crypto outlook', score: 60 },
      { name: 'MyCryptoParadise', desc: 'Crypto signal provider, educational content', score: 70 },
      { name: 'CobraVanguard', desc: 'Active crypto publisher, technical setups', score: 60 },
    ]

    for (const a of knownAnalysts) {
      const key = a.name.toLowerCase()
      if (seen.has(key) || crmNames.has(key)) continue
      seen.add(key)
      orgs.push({
        source: 'tradingview',
        org: key,
        name: a.name,
        type: 'TradingView Analyst',
        website: `https://www.tradingview.com/u/${a.name}`,
        url: `https://www.tradingview.com/u/${a.name}`,
        description: a.desc,
        score: a.score,
        followers: 0,
      })
    }

    orgs.sort((a, b) => b.score - a.score)

    return NextResponse.json({ ok: true, orgs: orgs.slice(0, 40), total: orgs.length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

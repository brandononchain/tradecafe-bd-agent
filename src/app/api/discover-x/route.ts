import { NextRequest, NextResponse } from 'next/server'

// Discover crypto KOLs, traders, and influencers via GitHub (as proxy for X presence)
// Since X API is expensive ($100/mo+), we use GitHub search for crypto traders who list their X handles
// + manual curated lists of high-value targets

const CURATED_KOLS = [
  {name:'Crypto Tony',handle:'@CryptoTony__',followers:520000,niche:'Swing Trading / TA',platform:'X',website:'',description:'Dubai-based swing trader since 2017. Clean TA on BTC, ETH, altcoins.'},
  {name:'Trader_XO',handle:'@Trader_XO',followers:500000,niche:'Systems Trading',platform:'X',website:'',description:'Swing trading + altcoin breakouts. Substack for strategy. Repeatable systems focus.'},
  {name:'Ali Martinez',handle:'@ali_charts',followers:135000,niche:'Price Action / TA',platform:'X',website:'',description:'Clean TA focusing on price action, volume, market structure. Data-driven.'},
  {name:'Scott Melker',handle:'@scottmelker',followers:500000,niche:'Trading / Podcast',platform:'X',website:'https://thewolfofallstreets.io',description:'Wolf of All Streets podcast. Trader + content creator. Existing monetization infra.'},
  {name:'CryptoWendyO',handle:'@CryptoWendyO',followers:200000,niche:'Trading / Risk Mgmt',platform:'X',website:'',description:'Crypto trader + analyst. TA, trading tips, risk management focus.'},
  {name:'Ash Crypto',handle:'@Ashcryptoreal',followers:1000000,niche:'Crypto / Signals',platform:'X',website:'',description:'Seasoned crypto trader since 2016. Market insights, airdrops, signals. Massive reach.'},
  {name:'MMCrypto',handle:'@MMCrypto',followers:1700000,niche:'Crypto / YouTube',platform:'X',website:'',description:'1.7M followers. YouTube + X. Optimistic BTC view, thorough TA. Co-founded MMConsult.'},
  {name:'Rekt Capital',handle:'@raboridapo',followers:400000,niche:'Macro / TA',platform:'X',website:'',description:'Macro crypto analysis. BTC halving cycles, alt season timing. Educational content.'},
  {name:'Altcoin Sherpa',handle:'@AltcoinSherpa',followers:200000,niche:'Altcoins / Swing',platform:'X',website:'',description:'Altcoin swing trader. Clean entries, patient exits. Community engagement.'},
  {name:'Crypto Birb',handle:'@crypto_birb',followers:700000,niche:'TA / Signals',platform:'X',website:'https://cryptobirb.com',description:'Technical analysis, trading signals. Premium group. Strong brand.'},
  {name:'DonAlt',handle:'@CryptoDonAlt',followers:300000,niche:'Trading / YouTube',platform:'X',website:'',description:'Crypto trader + YouTuber. Honest analysis. Counter-narrative takes.'},
  {name:'Hsaka',handle:'@HsakaTrades',followers:250000,niche:'Trading / DeFi',platform:'X',website:'',description:'DeFi trader, on-chain analysis. Alpha calls. Well-respected in CT.'},
  {name:'Cobie',handle:'@coaborow',followers:700000,niche:'CT Legend / VC',platform:'X',website:'',description:'Crypto Twitter OG. Former podcast host. Angel investor. Massive influence.'},
  {name:'GCR',handle:'@GCRClassic',followers:250000,niche:'Trading / Contrarian',platform:'X',website:'',description:'Legendary crypto trader. Contrarian calls. Huge respect in CT.'},
  {name:'CryptoCapo',handle:'@CryptoCapo_',followers:400000,niche:'TA / Macro',platform:'X',website:'',description:'Macro crypto analysis. High engagement. Strong community.'},
  {name:'IncomeSharks',handle:'@IncomeSharks',followers:300000,niche:'Swing Trading',platform:'X',website:'',description:'Swing trading stocks + crypto. Technical setups. Actionable calls.'},
  {name:'Bluntz',handle:'@Bluntz_Capital',followers:200000,niche:'Elliott Wave / TA',platform:'X',website:'',description:'Elliott Wave specialist. Crypto and forex. Detailed chart analysis.'},
  {name:'CryptoGodJohn',handle:'@CryptoGodJohn',followers:500000,niche:'Trading / Content',platform:'X',website:'',description:'Crypto trading content. Tutorials. Beginner-friendly. High engagement.'},
  {name:'Pentoshi',handle:'@Pentosh1',followers:600000,niche:'Trading / Macro',platform:'X',website:'',description:'Macro crypto trader. BTC dominance plays. Respected analysis.'},
  {name:'ColdBloodShill',handle:'@ColdBloodShill',followers:150000,niche:'Altcoins / Gems',platform:'X',website:'',description:'Altcoin hunter. Early gem finder. Active in DeFi. Community builder.'},
  {name:'Lark Davis',handle:'@TheCryptoLark',followers:500000,niche:'Crypto / YouTube',platform:'X',website:'https://larkdavis.com',description:'Crypto YouTuber. Daily updates. NFT, DeFi, trading content. 500K+ on YouTube.'},
  {name:'DataDash',handle:'@Nicholas_Merten',followers:300000,niche:'Trading / YouTube',platform:'X',website:'',description:'DataDash YouTube channel. Macro analysis, trading strategies. Trusted voice.'},
  {name:'LayahHeilpern',handle:'@LayahHeilpern',followers:200000,niche:'Crypto / Content',platform:'X',website:'',description:'Crypto content creator. Interviews, market updates. Strong brand presence.'},
  {name:'Miles Deutscher',handle:'@milesdeutscher',followers:500000,niche:'DeFi / Research',platform:'X',website:'',description:'DeFi researcher. Airdrop strategies. Detailed threads. High engagement.'},
  {name:'Ansem',handle:'@blaborhey',followers:400000,niche:'Solana / Memes',platform:'X',website:'',description:'Solana ecosystem trader. Memecoin plays. Massive CT influence.'},
]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const topicsParam = searchParams.get('topics') || ''
  const topicIds = topicsParam ? topicsParam.split(',').filter(Boolean) : []

  try {
    // Load existing CRM to dedupe
    const crmNames = new Set<string>()
    try {
      const at = await fetch(
        `https://api.airtable.com/v0/appCYgmFc8vTfwyv1/tblAsQXKEK9chUaT6?pageSize=200&fields[]=Company&fields[]=Name`,
        { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
      ).then(r => r.json())
      for (const rec of at.records || []) {
        if (rec.fields['Company']) crmNames.add(rec.fields['Company'].toLowerCase())
        if (rec.fields['Name']) crmNames.add(rec.fields['Name'].toLowerCase())
      }
    } catch {}

    // Filter by topic if selected
    let kols = [...CURATED_KOLS]
    if (topicIds.length > 0) {
      const nicheMap: Record<string, string[]> = {
        'crypto-traders': ['Trading', 'Swing', 'TA', 'Price Action'],
        'algo-trading': ['Systems', 'Quant', 'Elliott Wave'],
        'ai-trading': ['AI', 'Signals', 'Prediction'],
        'crypto-kols': ['YouTube', 'Podcast', 'Content', 'CT Legend'],
        'defi-protocols': ['DeFi', 'Solana', 'On-chain'],
        'content-creators': ['YouTube', 'Content', 'Podcast'],
      }
      const matchTerms = topicIds.flatMap(id => nicheMap[id] || [])
      if (matchTerms.length > 0) {
        kols = kols.filter(k => matchTerms.some(term => k.niche.includes(term) || k.description.includes(term)))
      }
    }

    // Dedupe against CRM
    kols = kols.filter(k => !crmNames.has(k.name.toLowerCase()))

    // Score by followers
    const orgs = kols.map(k => ({
      source: 'x-twitter',
      org: k.handle.replace('@', ''),
      name: k.name,
      type: k.niche,
      website: k.website,
      url: `https://x.com/${k.handle.replace('@', '')}`,
      description: k.description,
      followers: k.followers,
      score: Math.min(100, Math.round(Math.log10(k.followers + 1) * 15 + 20)),
      handle: k.handle,
    })).sort((a, b) => b.followers - a.followers)

    return NextResponse.json({ ok: true, orgs, total: orgs.length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

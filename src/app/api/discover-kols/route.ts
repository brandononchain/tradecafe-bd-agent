import { NextRequest, NextResponse } from 'next/server'

// ── Unified KOL discovery engine ────────────────────────────────────────────
// Sources: curated KOL database, CoinGecko trending, GitHub crypto orgs
// Each returns normalized { name, handle, platform, niche, followers, website, description, score, email? }

type KOL = {
  name: string
  handle: string
  platform: string
  niche: string
  followers: number
  website: string
  description: string
  score: number
  email?: string
  source: string
  xUrl?: string
  linkedinUrl?: string
  githubUrl?: string
}

// ── CURATED KOL DATABASE ───────────────────────────────────────────────────
// High-value crypto KOLs verified by hand. This is the primary targeting list.
const CURATED: Omit<KOL, 'score' | 'source'>[] = [
  // === TIER 1: Mega KOLs (500K+) ===
  { name: 'Ash Crypto', handle: '@Ashcryptoreal', platform: 'X', niche: 'Signals / Trading', followers: 1000000, website: '', description: 'Crypto trader since 2016. Market calls, airdrops, trading signals. Massive X reach. Open to partnerships.' },
  { name: 'MMCrypto', handle: '@MMCrypto', platform: 'X+YouTube', niche: 'TA / Education', followers: 1700000, website: '', description: '1.7M combined. YouTube + X. BTC analysis, leverage trading content. Co-founded MMConsult.' },
  { name: 'Crypto Birb', handle: '@crypto_birb', platform: 'X', niche: 'TA / Signals', followers: 700000, website: 'https://cryptobirb.com', description: 'Technical analysis, premium signal group. Strong brand. Monetization-ready audience.' },
  { name: 'Cobie', handle: '@coaborow', platform: 'X', niche: 'CT OG / Investor', followers: 700000, website: '', description: 'Crypto Twitter legend. Former podcast host. Angel investor. Massive influence in CT.' },
  { name: 'Pentoshi', handle: '@Pentosh1', platform: 'X', niche: 'Macro / Trading', followers: 600000, website: '', description: 'Macro crypto trader. BTC dominance plays. High conviction calls. Respected voice.' },
  { name: 'Crypto Tony', handle: '@CryptoTony__', platform: 'X', niche: 'Swing / TA', followers: 520000, website: '', description: 'Dubai-based swing trader since 2017. Clean TA on BTC, ETH, altcoins. Consistent posting.' },
  { name: 'Trader_XO', handle: '@Trader_XO', platform: 'X', niche: 'Systems / Swing', followers: 500000, website: '', description: 'Swing trading systems. Substack strategy breakdowns. Repeatable setups.' },
  { name: 'Scott Melker', handle: '@scottmelker', platform: 'X+Podcast', niche: 'Trading / Media', followers: 500000, website: 'https://thewolfofallstreets.io', description: 'Wolf of All Streets podcast. Trader + content creator. Existing monetization infra.' },
  { name: 'CryptoGodJohn', handle: '@CryptoGodJohn', platform: 'X', niche: 'Trading / Content', followers: 500000, website: '', description: 'Crypto trading tutorials. Beginner-friendly. High engagement rate.' },
  { name: 'Miles Deutscher', handle: '@milesdeutscher', platform: 'X', niche: 'DeFi / Research', followers: 500000, website: '', description: 'DeFi researcher. Airdrop strategies. Detailed threads. Strong community.' },
  { name: 'Lark Davis', handle: '@TheCryptoLark', platform: 'X+YouTube', niche: 'Crypto / YouTube', followers: 500000, website: 'https://larkdavis.com', description: 'Daily crypto updates on YouTube. NFT, DeFi, trading content. 500K+ subscribers.' },

  // === TIER 2: Major KOLs (200K-500K) ===
  { name: 'CryptoCapo', handle: '@CryptoCapo_', platform: 'X', niche: 'TA / Macro', followers: 400000, website: '', description: 'Macro crypto analysis. High engagement. Contrarian calls that get attention.' },
  { name: 'Rekt Capital', handle: '@raboridapo', platform: 'X', niche: 'Macro / Cycles', followers: 400000, website: '', description: 'BTC halving cycle analysis. Alt season timing. Educational long-form content.' },
  { name: 'Ansem', handle: '@blaborhey', platform: 'X', niche: 'Solana / Memes', followers: 400000, website: '', description: 'Solana ecosystem. Memecoin alpha. Massive CT influence and engagement.' },
  { name: 'DonAlt', handle: '@CryptoDonAlt', platform: 'X+YouTube', niche: 'Trading / Analysis', followers: 300000, website: '', description: 'Honest crypto analysis. Counter-narrative takes. YouTube + X presence.' },
  { name: 'DataDash', handle: '@Nicholas_Merten', platform: 'X+YouTube', niche: 'Trading / YouTube', followers: 300000, website: '', description: 'DataDash YouTube channel. Macro analysis, trading strategies. Trusted voice in space.' },
  { name: 'IncomeSharks', handle: '@IncomeSharks', platform: 'X', niche: 'Swing / Multi-Asset', followers: 300000, website: '', description: 'Swing trading stocks + crypto. Actionable TA setups. Cross-asset approach.' },
  { name: 'Hsaka', handle: '@HsakaTrades', platform: 'X', niche: 'DeFi / On-Chain', followers: 250000, website: '', description: 'DeFi trader, on-chain analysis. Alpha calls. Well-respected in CT circles.' },
  { name: 'GCR', handle: '@GCRClassic', platform: 'X', niche: 'Contrarian / Legend', followers: 250000, website: '', description: 'Legendary crypto trader. Contrarian calls. Massive respect. Cult following.' },
  { name: 'CryptoWendyO', handle: '@CryptoWendyO', platform: 'X', niche: 'Trading / Risk', followers: 200000, website: '', description: 'Crypto analyst. TA, trading tips, risk management focus. Educator.' },
  { name: 'Altcoin Sherpa', handle: '@AltcoinSherpa', platform: 'X', niche: 'Altcoins / Swing', followers: 200000, website: '', description: 'Patient altcoin swing trader. Clean entries, disciplined exits. Active community.' },
  { name: 'LayahHeilpern', handle: '@LayahHeilpern', platform: 'X', niche: 'Crypto / Interviews', followers: 200000, website: '', description: 'Crypto content creator. Interviews with industry leaders. Strong personal brand.' },
  { name: 'Bluntz', handle: '@Bluntz_Capital', platform: 'X', niche: 'Elliott Wave / TA', followers: 200000, website: '', description: 'Elliott Wave specialist. Crypto + forex analysis. Detailed chart breakdowns.' },

  // === TIER 3: Rising / Niche KOLs (50K-200K) ===
  { name: 'ColdBloodShill', handle: '@ColdBloodShill', platform: 'X', niche: 'Altcoins / DeFi', followers: 150000, website: '', description: 'Altcoin hunter. Early gem finder. Active DeFi participant. Community builder.' },
  { name: 'Ali Martinez', handle: '@ali_charts', platform: 'X', niche: 'Price Action / TA', followers: 135000, website: '', description: 'Clean TA. Price action, volume, market structure analysis. Data-driven approach.' },
  { name: 'CryptoJack', handle: '@CryptoJack', platform: 'X', niche: 'Trading / Education', followers: 120000, website: '', description: 'Trading education. Chart analysis. Community building. Consistent posting.' },
  { name: 'TheCryptoDog', handle: '@TheCryptoDog', platform: 'X', niche: 'TA / Community', followers: 110000, website: '', description: 'Crypto TA. Strong community engagement. OG crypto twitter presence.' },
  { name: 'CryptoKaleo', handle: '@CryptoKaleo', platform: 'X', niche: 'Trading / Calls', followers: 100000, website: '', description: 'Crypto trading calls. Market structure analysis. Active engagement.' },
  { name: 'Nebraskan Gooner', handle: '@nebaborkangooner', platform: 'X', niche: 'Memes / Trading', followers: 90000, website: '', description: 'Solana ecosystem. Trading + meme culture. High engagement rate.' },
  { name: 'Crypto Maven', handle: '@CryptoMaven_', platform: 'X', niche: 'Trading / Analysis', followers: 85000, website: '', description: 'Crypto market analysis. Clean charts. Growing audience.' },
  { name: 'Trader Mayne', handle: '@Tradermayne', platform: 'X', niche: 'Futures / Leverage', followers: 80000, website: '', description: 'Futures trader. Leverage plays. Real-time trade sharing.' },
  { name: 'Poseidon', handle: '@CryptoPoseidon0', platform: 'X', niche: 'TA / Altcoins', followers: 75000, website: '', description: 'Altcoin TA. Entry/exit zones. Growing following. Partnership potential.' },
  { name: 'Wise Advice', handle: '@WiseAdviceTech', platform: 'X+YouTube', niche: 'Crypto / YouTube', followers: 70000, website: '', description: 'Crypto education YouTube. Trading strategies. Growing channel.' },

  // === TELEGRAM / DISCORD COMMUNITY LEADERS ===
  { name: 'Crypto Rand', handle: '@crypto_rand', platform: 'X+Telegram', niche: 'Signals / Community', followers: 60000, website: '', description: 'Runs paid Telegram signal group. Active X presence. Partnership revenue model fits.' },
  { name: 'CryptoHamster', handle: '@CryptoHamsterIO', platform: 'X+Telegram', niche: 'TA / Signals', followers: 55000, website: '', description: 'Telegram signal community. TA-focused. Real-time trade alerts.' },

  // === YOUTUBE-FIRST CREATORS ===
  { name: 'Coin Bureau', handle: '@coinaborbureau', platform: 'YouTube', niche: 'Education / Reviews', followers: 2400000, website: 'https://coinbureau.com', description: '2.4M YouTube subscribers. Deep dives on crypto projects. Monetization-ready audience.' },
  { name: 'BitBoy Crypto', handle: '@Bitboy_Crypto', platform: 'X+YouTube', niche: 'Crypto / Mass Market', followers: 1500000, website: '', description: 'Mass market crypto content. High volume. Partnership-driven model.' },
  { name: 'Crypto Banter', handle: '@cryptobanter', platform: 'X+YouTube', niche: 'Live Trading / Show', followers: 800000, website: 'https://cryptobanter.com', description: 'Live crypto trading show. Multiple hosts. Sponsor-friendly format.' },
  { name: 'Altcoin Daily', handle: '@AltcoinDailyio', platform: 'X+YouTube', niche: 'Daily News / Trading', followers: 600000, website: '', description: 'Daily crypto news + analysis on YouTube. Consistent upload schedule. Ad-friendly.' },

  // === TRADERS WITH PROVEN TRACK RECORDS ===
  { name: 'Crypto Face', handle: '@CryptoFace_', platform: 'X', niche: 'Scalping / Live', followers: 100000, website: '', description: 'Live scalping on stream. Real-time P&L visible. Proof-of-performance model aligns with TradeCafe.' },
  { name: 'TraderSZ', handle: '@TraderSZ', platform: 'X', niche: 'Futures / TA', followers: 90000, website: '', description: 'Futures trader with public track record. Clean analysis. Partnership potential.' },
]

// ── LIVE SCRAPE: CoinGecko trending ────────────────────────────────────────
async function scrapeCoinGecko(): Promise<KOL[]> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/search/trending', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const data = await res.json()
    const coins = data.coins || []
    return coins.slice(0, 15).map((c: any) => ({
      name: c.item?.name || '',
      handle: c.item?.id || '',
      platform: 'CoinGecko',
      niche: `Trending · Rank #${c.item?.market_cap_rank || '?'}`,
      followers: c.item?.market_cap_rank ? 10000 - (c.item.market_cap_rank * 10) : 0,
      website: `https://www.coingecko.com/en/coins/${c.item?.id}`,
      description: `${c.item?.symbol?.toUpperCase()} — trending on CoinGecko. Score: ${c.item?.score || 0}. Find the project team and reach out for partnership.`,
      score: Math.min(100, 40 + (c.item?.score || 0) * 5),
      source: 'coingecko-trending',
    }))
  } catch { return [] }
}

// ── LIVE SCRAPE: GitHub crypto orgs ────────────────────────────────────────
async function scrapeGitHub(): Promise<KOL[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'TradeCafeBD/2.0',
  }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

  try {
    const queries = ['crypto+trading+bot', 'defi+protocol', 'trading+algorithm+crypto']
    const allOrgs: KOL[] = []

    for (const q of queries) {
      try {
        const res = await fetch(`https://api.github.com/search/repositories?q=${q}&sort=stars&per_page=10`, {
          headers, signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) continue
        const data = await res.json()
        for (const repo of data.items || []) {
          const owner = repo.owner
          if (!owner || owner.type !== 'Organization') continue
          if (allOrgs.some(o => o.handle === owner.login)) continue
          allOrgs.push({
            name: owner.login,
            handle: owner.login,
            platform: 'GitHub',
            niche: `Open Source · ${repo.stargazers_count?.toLocaleString()} stars`,
            followers: repo.stargazers_count || 0,
            website: repo.homepage || '',
            description: `${repo.full_name}: ${repo.description || 'Crypto/trading project'}. ${repo.stargazers_count} stars, ${repo.forks_count} forks.`,
            score: Math.min(100, Math.round(Math.log10((repo.stargazers_count || 0) + 1) * 20)),
            source: 'github',
            githubUrl: `https://github.com/${owner.login}`,
            email: owner.email || undefined,
          })
        }
      } catch {}
    }
    return allOrgs.slice(0, 20)
  } catch { return [] }
}

// ── SCORE FUNCTION ─────────────────────────────────────────────────────────
function scoreKOL(k: Omit<KOL, 'score' | 'source'>): number {
  let s = 0
  // Follower weight (log scale)
  s += Math.min(40, Math.round(Math.log10(Math.max(k.followers, 1)) * 8))
  // Platform multiplier
  if (k.platform.includes('YouTube')) s += 10
  if (k.platform.includes('Telegram')) s += 5
  if (k.platform.includes('+')) s += 5 // Multi-platform
  // Niche relevance to TradeCafe
  const tradingTerms = ['Trading', 'Signals', 'TA', 'Swing', 'Futures', 'Scalp', 'Leverage', 'Systems']
  const matchCount = tradingTerms.filter(t => k.niche.includes(t) || k.description.includes(t)).length
  s += matchCount * 5
  // Has website = easier to find email
  if (k.website) s += 5
  return Math.min(100, s)
}

// ── MAIN HANDLER ───────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const source = searchParams.get('source') || 'all' // all | curated | coingecko | github
  const tier = searchParams.get('tier') || 'all' // all | mega | major | rising
  const nicheFilter = searchParams.get('niche') || '' // trading, defi, youtube, signals, etc.

  try {
    // Load CRM for deduplication
    const crmNames = new Set<string>()
    try {
      const at = await fetch(
        `https://api.airtable.com/v0/appCYgmFc8vTfwyv1/tblAsQXKEK9chUaT6?pageSize=100&fields[]=Company&fields[]=Name`,
        { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` }, signal: AbortSignal.timeout(5000) }
      ).then(r => r.json())
      for (const rec of at.records || []) {
        if (rec.fields['Company']) crmNames.add(rec.fields['Company'].toLowerCase())
        if (rec.fields['Name']) crmNames.add(rec.fields['Name'].toLowerCase())
      }
    } catch {}

    let results: KOL[] = []

    // Curated KOLs (always fast, no API calls)
    if (source === 'all' || source === 'curated') {
      const curated: KOL[] = CURATED.map(k => ({
        ...k,
        score: scoreKOL(k),
        source: 'curated',
        xUrl: k.handle.startsWith('@') ? `https://x.com/${k.handle.replace('@', '')}` : undefined,
      }))
      results.push(...curated)
    }

    // CoinGecko trending (live scrape)
    if (source === 'all' || source === 'coingecko') {
      const cg = await scrapeCoinGecko()
      results.push(...cg)
    }

    // GitHub crypto orgs (live scrape)
    if (source === 'github') {
      const gh = await scrapeGitHub()
      results.push(...gh)
    }

    // Filter by tier
    if (tier === 'mega') results = results.filter(k => k.followers >= 500000)
    else if (tier === 'major') results = results.filter(k => k.followers >= 200000 && k.followers < 500000)
    else if (tier === 'rising') results = results.filter(k => k.followers < 200000)

    // Filter by niche keyword
    if (nicheFilter) {
      const terms = nicheFilter.toLowerCase().split(',')
      results = results.filter(k =>
        terms.some(t => k.niche.toLowerCase().includes(t) || k.description.toLowerCase().includes(t) || k.platform.toLowerCase().includes(t))
      )
    }

    // Dedupe against CRM
    results = results.filter(k => !crmNames.has(k.name.toLowerCase()))

    // Sort by score descending
    results.sort((a, b) => b.score - a.score)

    return NextResponse.json({ ok: true, kols: results, total: results.length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

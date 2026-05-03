export interface Topic {
  id: string; label: string; emoji: string; category: string; description: string
  githubQ: string[]; hnKeywords: string[]; liKeywords: string[]; ycTags: string[]
}

export const TOPICS: Topic[] = [
  // Crypto Trading
  {id:'crypto-traders',label:'Crypto Traders',emoji:'📊',category:'Crypto Trading',description:'Active crypto traders, TA analysts, signal providers',
   githubQ:['crypto+trading+bot+stars:>50','bitcoin+trading+strategy+stars:>30','crypto+signals+stars:>20'],
   hnKeywords:['crypto trading','bitcoin trading','crypto signals','trading bot'],liKeywords:['crypto trader'],ycTags:['Crypto / Web3','Fintech']},
  {id:'algo-trading',label:'Algo & Quant',emoji:'🤖',category:'Crypto Trading',description:'Algorithmic trading, quant strategies, trading bots',
   githubQ:['algorithmic+trading+stars:>100','quantitative+trading+stars:>50','trading+bot+python+stars:>30','backtest+trading+stars:>50'],
   hnKeywords:['algorithmic trading','quant trading','trading bot','backtesting'],liKeywords:['algorithmic trading crypto'],ycTags:['Fintech','Machine Learning']},
  {id:'trading-tools',label:'Trading Tools',emoji:'🔧',category:'Crypto Trading',description:'Charting, analytics, portfolio trackers, trading platforms',
   githubQ:['crypto+portfolio+tracker+stars:>30','trading+platform+crypto+stars:>50','crypto+analytics+dashboard+stars:>20'],
   hnKeywords:['trading platform','crypto analytics','portfolio tracker'],liKeywords:['crypto trading tools startup'],ycTags:['Fintech','Developer Tools']},
  {id:'ai-trading',label:'AI Trading',emoji:'🧠',category:'Crypto Trading',description:'AI/ML trading signals, prediction models, sentiment analysis',
   githubQ:['ai+trading+prediction+stars:>30','crypto+sentiment+analysis+stars:>20','ml+price+prediction+stars:>30'],
   hnKeywords:['ai trading','crypto prediction','trading ai','sentiment trading'],liKeywords:['AI trading platform'],ycTags:['Artificial Intelligence','Fintech']},

  // DeFi & Web3
  {id:'defi-protocols',label:'DeFi Protocols',emoji:'⛓️',category:'DeFi & Web3',description:'DEXs, lending, yield, staking protocols',
   githubQ:['defi+protocol+solidity+stars:>100','decentralized+exchange+stars:>50','yield+farming+stars:>30'],
   hnKeywords:['defi protocol','decentralized exchange','yield farming','staking'],liKeywords:['DeFi protocol startup'],ycTags:['Crypto / Web3']},
  {id:'web3-wallets',label:'Wallets & Infra',emoji:'💼',category:'DeFi & Web3',description:'Wallet SDKs, bridge protocols, chain infrastructure',
   githubQ:['crypto+wallet+sdk+stars:>50','blockchain+bridge+stars:>30','web3+developer+tools+stars:>50'],
   hnKeywords:['crypto wallet','web3 infrastructure','blockchain sdk'],liKeywords:['Web3 wallet startup'],ycTags:['Crypto / Web3','Developer Tools']},
  {id:'onchain-analytics',label:'On-Chain Analytics',emoji:'📈',category:'DeFi & Web3',description:'Blockchain data, whale tracking, on-chain intelligence',
   githubQ:['blockchain+analytics+stars:>30','on-chain+analysis+stars:>20','whale+tracking+crypto+stars:>10'],
   hnKeywords:['on-chain analytics','blockchain data','whale tracking','dune analytics'],liKeywords:['blockchain analytics startup'],ycTags:['Crypto / Web3','Analytics']},
  {id:'nft-gaming',label:'NFT & Gaming',emoji:'🎮',category:'DeFi & Web3',description:'NFT platforms, GameFi, play-to-earn',
   githubQ:['nft+marketplace+stars:>50','gamefi+play+earn+stars:>20','web3+gaming+stars:>30'],
   hnKeywords:['nft marketplace','gamefi','play to earn','web3 gaming'],liKeywords:['NFT gaming startup'],ycTags:['Crypto / Web3','Gaming']},

  // Forex & TradFi
  {id:'forex-trading',label:'Forex Trading',emoji:'💱',category:'Forex & TradFi',description:'Forex brokers, prop firms, signal services',
   githubQ:['forex+trading+bot+stars:>20','metatrader+expert+advisor+stars:>30','forex+signals+stars:>10'],
   hnKeywords:['forex trading','prop firm','forex signals','metatrader'],liKeywords:['forex trading platform'],ycTags:['Fintech']},
  {id:'prop-firms',label:'Prop Firms',emoji:'🏦',category:'Forex & TradFi',description:'Proprietary trading firms, funded trader programs',
   githubQ:['prop+trading+firm+stars:>10','funded+trader+stars:>5'],
   hnKeywords:['prop firm','funded trader','proprietary trading'],liKeywords:['prop trading firm startup'],ycTags:['Fintech']},
  {id:'fintech-payments',label:'Payments & Fintech',emoji:'💳',category:'Forex & TradFi',description:'Payment infrastructure, neobanks, crypto payments',
   githubQ:['crypto+payments+gateway+stars:>30','fintech+payments+stars:>50'],
   hnKeywords:['crypto payments','fintech payments','neobank','payment gateway'],liKeywords:['crypto payments fintech startup'],ycTags:['Fintech','Payments']},

  // KOL & Influencer
  {id:'crypto-kols',label:'Crypto KOLs',emoji:'🎤',category:'KOL & Influencer',description:'Crypto influencers, trading educators, CT personalities',
   githubQ:['crypto+education+stars:>20','trading+education+stars:>10'],
   hnKeywords:['crypto influencer','trading educator','crypto twitter'],liKeywords:['crypto influencer marketing'],ycTags:['Creator Economy']},
  {id:'trading-communities',label:'Trading Communities',emoji:'👥',category:'KOL & Influencer',description:'Discord/Telegram trading groups, signal channels',
   githubQ:['discord+trading+bot+stars:>30','telegram+crypto+bot+stars:>20','trading+community+stars:>10'],
   hnKeywords:['trading community','trading discord','crypto telegram','signal group'],liKeywords:['trading community platform'],ycTags:['Consumer','Social']},
  {id:'content-creators',label:'Finance Creators',emoji:'📹',category:'KOL & Influencer',description:'Finance YouTubers, TikTokers, podcasters',
   githubQ:['finance+content+stars:>10'],
   hnKeywords:['finance youtube','trading tiktok','crypto podcast','finance creator'],liKeywords:['finance content creator'],ycTags:['Creator Economy','Media']},

  // MLM & Network Marketing
  {id:'mlm-networks',label:'MLM Networks',emoji:'🕸️',category:'Network Marketing',description:'Network marketing, referral systems, affiliate platforms',
   githubQ:['referral+system+stars:>30','mlm+software+stars:>10','affiliate+platform+stars:>50'],
   hnKeywords:['network marketing','mlm software','referral platform','affiliate system'],liKeywords:['network marketing platform'],ycTags:['B2B','Marketplace']},
  {id:'affiliate-marketing',label:'Affiliate Marketing',emoji:'🔗',category:'Network Marketing',description:'Affiliate platforms, commission tracking, performance marketing',
   githubQ:['affiliate+marketing+platform+stars:>30','commission+tracking+stars:>20'],
   hnKeywords:['affiliate marketing','commission tracking','performance marketing'],liKeywords:['affiliate marketing platform startup'],ycTags:['B2B','Marketing']},

  // Blockchain Infrastructure
  {id:'smart-contracts',label:'Smart Contracts',emoji:'📝',category:'Blockchain',description:'Solidity devs, auditors, EVM tooling',
   githubQ:['solidity+smart+contract+stars:>100','evm+tooling+development+stars:>50','smart+contract+audit+stars:>30'],
   hnKeywords:['smart contract','solidity','evm','contract audit'],liKeywords:['smart contract development'],ycTags:['Crypto / Web3','Developer Tools']},
  {id:'l2-scaling',label:'L2 & Scaling',emoji:'🚀',category:'Blockchain',description:'L2 rollups, sidechains, cross-chain bridges',
   githubQ:['layer2+rollup+stars:>50','cross+chain+bridge+stars:>30','blockchain+scaling+stars:>30'],
   hnKeywords:['layer 2','rollup','cross chain','scaling solution'],liKeywords:['L2 blockchain startup'],ycTags:['Crypto / Web3']},
  {id:'dao-governance',label:'DAO & Governance',emoji:'🏛️',category:'Blockchain',description:'DAO tooling, governance platforms, treasury management',
   githubQ:['dao+governance+tooling+stars:>30','dao+treasury+management+stars:>20'],
   hnKeywords:['dao tooling','governance platform','dao treasury'],liKeywords:['DAO governance startup'],ycTags:['Crypto / Web3']},
]

// ── Build search query arrays per source ────────────────────────────────────

export function buildGitHubQueries(selectedTopicIds: string[]): string[] {
  const topics = selectedTopicIds.length > 0
    ? TOPICS.filter(t => selectedTopicIds.includes(t.id))
    : TOPICS
  const queries: string[] = []
  for (const t of topics) queries.push(...t.githubQ)
  return queries
}

export function buildHNKeywords(selectedTopicIds: string[]): string[] {
  const topics = selectedTopicIds.length > 0
    ? TOPICS.filter(t => selectedTopicIds.includes(t.id))
    : TOPICS
  const keywords: string[] = []
  for (const t of topics) keywords.push(...t.hnKeywords)
  return keywords
}

export function buildLIKeywords(selectedTopicIds: string[]): string[] {
  const topics = selectedTopicIds.length > 0
    ? TOPICS.filter(t => selectedTopicIds.includes(t.id))
    : TOPICS
  const keywords: string[] = []
  for (const t of topics) keywords.push(...t.liKeywords)
  return keywords
}

export function buildYCTags(selectedTopicIds: string[]): string[] {
  const topics = selectedTopicIds.length > 0
    ? TOPICS.filter(t => selectedTopicIds.includes(t.id))
    : TOPICS
  const tags = new Set<string>()
  for (const t of topics) t.ycTags.forEach(tag => tags.add(tag))
  return Array.from(tags)
}

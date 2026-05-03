'use client'
import { useState, useRef, useCallback, useEffect } from 'react'

// Field IDs kept for reference only — writes now use field names (typecast:true)
// Reads use field names directly since Airtable REST API returns fields by name

const TARGETS = [
  {org:'ccxt',name:'CCXT',type:'Trading Tools'},
  {org:'freqtrade',name:'Freqtrade',type:'Algo Trading'},
  {org:'hummingbot',name:'Hummingbot',type:'Algo Trading'},
  {org:'jesse-ai',name:'Jesse AI',type:'AI Trading'},
  {org:'Superalgos',name:'Superalgos',type:'Algo Trading'},
  {org:'3commas-io',name:'3Commas',type:'Trading Tools'},
  {org:'shrimpy-dev',name:'Shrimpy',type:'Trading Tools'},
  {org:'Uniswap',name:'Uniswap',type:'DeFi'},
  {org:'aave',name:'Aave',type:'DeFi'},
  {org:'compound-finance',name:'Compound',type:'DeFi'},
  {org:'tradingview',name:'TradingView',type:'Trading Tools'},
  {org:'CryptoSignal',name:'CryptoSignal',type:'Trading Tools'},
  {org:'Dexalot',name:'Dexalot',type:'DeFi'},
  {org:'drift-labs',name:'Drift Protocol',type:'DeFi'},
  {org:'Jupiter-Exchange',name:'Jupiter',type:'DeFi'},
  {org:'phantom',name:'Phantom',type:'Wallet'},
  {org:'LedgerHQ',name:'Ledger',type:'Wallet'},
  {org:'bybit-exchange',name:'Bybit',type:'Exchange'},
  {org:'binance',name:'Binance',type:'Exchange'},
  {org:'okx',name:'OKX',type:'Exchange'},
]

type Lead={
  id:string; company:string; contactName:string; contactEmail:string;
  jobTitle:string; companyType:string; status:string; sequenceStatus:string;
  githubOrgUrl:string; website:string; aiTools:string; notes:string;
  emailSubject:string; emailBody:string; source:string;
  // GitHub metrics
  githubStars:number; githubForks:number; githubWatchers:number;
  orgMembers:number; contributors:number; openIssues:number; repoCount:number;
  topRepos:string; leadScore:number; description:string;
  lastContacted:string;
  // Sequence emails
  followUp1Subject:string; followUp1Body:string;
  followUp2Subject:string; followUp2Body:string;
  // Reply fields
  replyText:string; replyIntent:string; suggestedReply:string; replySent:boolean;
  // Tracking + ICP
  openCount:number; lastOpened:string; bounced:boolean; disqualified:boolean; emailVerified:boolean; bounceReason:string; bounceDate:string; replyDate:string;
}
type Log={t:string;msg:string;type:'i'|'o'|'w'|'e'}

function mapRecord(r:any):Lead{
  const f = r.fields||{}
  const g = (name:string,fallback='')=>{
    const v=f[name]
    if(v===undefined||v===null)return fallback
    if(typeof v==='object'&&'name' in v)return v.name
    if(typeof v==='object'&&'state' in v)return fallback
    return String(v)
  }
  const n = (name:string)=>{ const v=f[name]; return typeof v==='number'?v:0 }
  return {
    id:r.id,
    company:      g('Company'),
    contactName:  g('Contact Name'),
    contactEmail: g('Contact Email'),
    jobTitle:     g('Job Title'),
    companyType:  g('Company Type'),
    status:       g('Status','New'),
    sequenceStatus: g('Sequence Status','Cold'),
    githubOrgUrl: g('GitHub Org URL'),
    website:      g('Website'),
    aiTools:      g('AI Tools Used'),
    notes:        g('Personalization Notes'),
    description:  g('Personalization Notes'),
    emailSubject: g('Email Subject'),
    emailBody:    g('Email Body'),
    source:       g('Source'),
    topRepos:     g('Top Repos'),
    lastContacted: g('Last Contacted'),
    // Numeric metrics
    githubStars:  n('GitHub Stars'),
    githubForks:  n('GitHub Forks'),
    githubWatchers: n('GitHub Watchers'),
    orgMembers:   n('Org Members'),
    contributors: n('Top Repo Contributors'),
    openIssues:   n('Open Issues'),
    repoCount:    n('Repo Count'),
    leadScore:    n('Lead Score'),
    // Sequence
    followUp1Subject: g('Follow-up 1 Subject'),
    followUp1Body:    g('Follow-up 1 Body'),
    followUp2Subject: g('Follow-up 2 Subject'),
    followUp2Body:    g('Follow-up 2 Body'),
    // Reply
    replyText:     g('Reply Text'),
    replyIntent:   g('Reply Intent'),
    suggestedReply: g('Suggested Reply'),
    replySent:      !!(f['Reply Sent']),
    openCount:      n('Open Count'),
    lastOpened:     g('Last Opened'),
    bounced:        !!(f['Bounced']),
    disqualified:   !!(f['Disqualified']),
    emailVerified:  !!(f['Email Verified']),
    bounceReason:   g('Bounce Reason'),
    bounceDate:     g('Bounce Date'),
    replyDate:      g('Reply Date'),
  }
}

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Inter:wght@100..900&family=JetBrains+Mono:wght@100..800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0a0a0f;--s1:#111118;--s2:#16161e;--s3:#1c1c26;
  --b:rgba(255,255,255,0.06);--b2:rgba(255,255,255,0.1);
  --ink:#e2e4e9;--ink2:#a0a4b0;--ink3:#6b7080;--dark:#0a0a0f;
  --green:#4ECDC4;--yellow:#FFB800;
  --red:#FF6B6B;--red2:#4ECDC4;--red3:#CC3333;
  --grad:linear-gradient(135deg,#4ECDC4 0%,#00E5A0 50%,#7B61FF 100%);
  --sh:0 1px 3px rgba(0,0,0,0.4);
  --r1:6px;--r2:10px;
  --sans:'Inter',system-ui,sans-serif;--mono:'JetBrains Mono','SF Mono',monospace;--body:'Inter',system-ui,sans-serif;
}
body{background:var(--bg);color:var(--ink);font-family:var(--body);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}
::selection{background:#4ECDC420}
.shell{display:flex;flex-direction:column;min-height:100vh}

/* TOPBAR */
.topbar{display:flex;align-items:center;justify-content:space-between;padding:0 32px;height:54px;background:var(--s1);border-bottom:1px solid var(--b);position:sticky;top:0;z-index:100;box-shadow:var(--sh)}
.brand{display:flex;align-items:center;gap:10px}
.brand-name{font-family:var(--sans);font-weight:700;font-size:16px;letter-spacing:-.4px}
.brand-tag{font-family:var(--mono);font-size:9px;letter-spacing:1.5px;text-transform:uppercase;padding:2px 8px;border-radius:4px;background:#4ECDC4;color:#0a0a0f;font-weight:600}
.topbar-r{display:flex;align-items:center;gap:14px}
.chip{display:flex;align-items:center;gap:5px;font-family:var(--mono);font-size:10px;color:var(--ink3);padding:4px 10px;border-radius:20px;border:1px solid var(--b);background:var(--s2);transition:all .2s}
.chip.ok{border-color:#4ECDC430;background:#4ECDC410;color:#4ECDC4}
.chip.err{border-color:#FF6B6B30;background:#FF6B6B10;color:#FF6B6B}
.dot{width:6px;height:6px;border-radius:50%;background:var(--b2);flex-shrink:0;transition:all .3s}
.dot.ok{background:var(--green)}
.dot.err{background:#4ECDC4;color:#0a0a0f}
.dot.spin{background:var(--yellow);animation:pdot 1s infinite}
@keyframes pdot{0%,100%{opacity:1}50%{opacity:.3}}

/* NAV */
.nav{display:flex;background:var(--s1);border-bottom:1px solid var(--b);padding:0 32px;overflow-x:auto}
.nb{display:flex;align-items:center;gap:7px;padding:0 18px;height:42px;font-family:var(--mono);font-size:10px;color:var(--ink3);cursor:pointer;background:none;border:none;border-bottom:2px solid transparent;white-space:nowrap;transition:all .15s;text-transform:uppercase;letter-spacing:1px}
.nb:hover{color:var(--ink)}
.nb.active{color:#4ECDC4;border-bottom-color:#4ECDC4}
.nn{font-size:9px;border-radius:4px;padding:1px 5px;min-width:16px;text-align:center;font-weight:600;background:var(--dark);color:#fff}
.nn.warn{background:#4ECDC4;color:#0a0a0f}

/* STATS STRIP */
.strip{background:var(--s1);border-bottom:1px solid var(--b)}
.strip-inner{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:repeat(5,1fr)}
.scell{padding:14px 20px;border-right:1px solid var(--b);display:flex;align-items:center;gap:12px}
.scell:last-child{border-right:none}
.sval{font-family:var(--sans);font-size:22px;font-weight:800;letter-spacing:-.5px;line-height:1;color:var(--ink4)}
.sval.on{color:var(--ink)}
.sval.live{background:linear-gradient(135deg,#4ECDC4,#00E5A0);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.slbl{font-family:var(--mono);font-size:9px;color:var(--ink3);text-transform:uppercase;letter-spacing:.8px;margin-top:3px}
.sico{font-size:18px;opacity:.12}

/* PAGE */
.page{flex:1;padding:32px;max-width:1200px;margin:0 auto;width:100%}
.ph{margin-bottom:28px}
.ph-t{font-family:var(--sans);font-size:20px;font-weight:700;letter-spacing:-.3px}
.ph-s{font-size:12px;color:var(--ink3);margin-top:4px}

/* CARDS */
.card{background:var(--s1);border:1px solid var(--b);border-radius:var(--r2);padding:24px;margin-bottom:16px;box-shadow:var(--sh)}
.card-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:12px;flex-wrap:wrap}
.ct{font-family:var(--mono);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:var(--ink3);display:flex;align-items:center;gap:8px}
.ct::before{content:'';width:3px;height:12px;background:linear-gradient(135deg,#4ECDC4,#00E5A0);border-radius:2px;display:block;flex-shrink:0}

/* HEALTH GRID */
.hgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px}
.hcard{border-radius:var(--r2);padding:20px;background:var(--s1);border:1.5px solid var(--b);box-shadow:var(--sh);position:relative;overflow:hidden;transition:box-shadow .2s}
.hcard:hover{box-shadow:var(--sh2)}
.hbar{position:absolute;top:0;left:0;right:0;height:3px;background:var(--b)}
.hbar.ok{background:linear-gradient(135deg,#4ECDC4,#00E5A0)}
.hbar.err{background:#4ECDC4;color:#0a0a0f}
.hbar.spin{background:linear-gradient(90deg,var(--b) 0%,var(--yellow) 50%,var(--b) 100%);background-size:200%;animation:bspin 1.4s infinite}
@keyframes bspin{0%{background-position:200% 0}100%{background-position:-200% 0}}
.hcard-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.hico{width:34px;height:34px;border-radius:8px;background:var(--s3);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.hbadge{font-family:var(--mono);font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;padding:3px 8px;border-radius:4px}
.hbadge.ok{background:#16a34a12;color:var(--green)}
.hbadge.err{background:#4ECDC412;color:var(--red)}
.hbadge.spin{background:#d9770612;color:var(--yellow)}
.hbadge.unknown{background:var(--s3);color:var(--ink3)}
.hname{font-family:var(--sans);font-size:14px;font-weight:700;margin-bottom:4px}
.hdetail{font-size:11px;color:var(--ink3);line-height:1.5}
.htags{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;padding-top:12px;border-top:1px solid var(--b)}
.htag{font-family:var(--mono);font-size:9px;padding:2px 7px;border-radius:4px;background:var(--s3);color:var(--ink3)}
.htag.g{background:#16a34a10;color:var(--green)}
.htag.r{background:#4ECDC410;color:var(--red)}
.htag.y{background:#d9770610;color:var(--yellow)}

/* PIPELINE */
.pipe-wrap{display:grid;grid-template-columns:repeat(4,1fr);background:var(--s1);border:1px solid var(--b);border-radius:var(--r2);overflow:hidden;margin-bottom:28px;box-shadow:var(--sh)}
.pipe{padding:22px 24px;position:relative;border-right:1px solid var(--b);transition:background .15s;cursor:default}
.pipe:last-child{border-right:none}
.pipe:hover{background:var(--s2)}
.pipe-n{font-family:var(--mono);font-size:9px;color:var(--ink4);letter-spacing:.5px;margin-bottom:6px;text-transform:uppercase}
.pipe-lbl{font-family:var(--sans);font-size:12px;font-weight:600;color:var(--ink2);margin-bottom:10px}
.pipe-val{font-family:var(--sans);font-size:36px;font-weight:800;letter-spacing:-1.5px;line-height:1;color:var(--ink4)}
.pipe-val.on{color:var(--ink)}
.pipe-val.done{background:linear-gradient(135deg,#4ECDC4,#00E5A0);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.pipe-sub{font-size:11px;color:var(--ink3);margin-top:6px}
.pipe-cta{display:inline-flex;align-items:center;gap:4px;margin-top:14px;font-family:var(--mono);font-size:10px;color:var(--red2);cursor:pointer;background:none;border:none;padding:0;letter-spacing:.3px}
.pipe-cta:hover{text-decoration:underline}
.pipe-bar{position:absolute;bottom:0;left:0;height:2px;background:linear-gradient(135deg,#4ECDC4,#00E5A0);transition:width .6s ease}
.pipe-check{position:absolute;top:20px;right:20px;width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#4ECDC4,#00E5A0);display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;opacity:0;transition:opacity .3s}
.pipe-check.on{opacity:1}

/* ACTIONS */
.agrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:28px}
.abtn{background:var(--s1);border:1.5px solid var(--b);border-radius:var(--r2);padding:16px 20px;cursor:pointer;transition:all .15s;box-shadow:var(--sh);display:flex;align-items:center;gap:14px;text-align:left}
.abtn:hover:not(:disabled){border-color:var(--red3);box-shadow:var(--sh2);transform:translateY(-1px)}
.abtn:disabled{opacity:.4;cursor:not-allowed}
.abtn.prime{background:var(--dark);border-color:var(--dark)}
.abtn.prime:hover:not(:disabled){background:var(--dark2);box-shadow:0 6px 20px rgba(15,17,21,.3)}
.aico{width:38px;height:38px;border-radius:8px;background:var(--s3);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.abtn.prime .aico{background:rgba(255,255,255,.1)}
.albl{font-family:var(--sans);font-size:13px;font-weight:700;margin-bottom:2px}
.abtn.prime .albl{color:#fff}
.asub{font-size:11px;color:var(--ink3)}
.abtn.prime .asub{color:rgba(255,255,255,.45)}

/* ENV */
.erow{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:6px;font-size:12px;transition:background .1s}
.erow:hover{background:var(--s2)}
.eok{color:var(--green);width:18px;text-align:center;flex-shrink:0;font-size:12px}
.emiss{color:var(--ink4);width:18px;text-align:center;flex-shrink:0;font-size:12px}
.ehint{font-size:11px;color:var(--ink3);flex:1}

/* LOG */
.logbox{background:var(--dark);border-radius:var(--r);padding:16px;overflow-y:auto}
.ll{display:flex;gap:12px;padding:1px 0}
.lt{font-family:var(--mono);color:#4a5568;min-width:68px;flex-shrink:0;font-size:10px;padding-top:1px}
.lm{font-family:var(--mono);line-height:1.5;font-size:11px}
.li{color:#94a3b8}.lo{color:#86efac}.lw{color:#fcd34d}.le{color:#fca5a5}
.lempty{font-family:var(--mono);font-size:11px;color:#4a5568;text-align:center;padding:24px 0}

/* FORM */
.field{margin-bottom:16px}
.field label{display:block;font-family:var(--mono);font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;font-weight:600}
.field input,.field select{width:100%;background:var(--bg);border:1.5px solid var(--b2);border-radius:var(--r);padding:9px 12px;color:var(--ink);font-family:var(--mono);font-size:12px;outline:none;transition:border-color .15s,box-shadow .15s}
.field input:focus,.field select:focus{border-color:var(--red2);box-shadow:0 0 0 3px #4ECDC410}
.field input::placeholder{color:var(--ink4)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.s2{grid-column:1/-1}

/* BUTTONS */
.btn{display:inline-flex;align-items:center;gap:7px;padding:9px 20px;border-radius:999px;font-family:var(--mono);font-size:11px;font-weight:500;cursor:pointer;border:none;transition:all .15s;letter-spacing:.3px;white-space:nowrap}
.btn:disabled{opacity:.4;cursor:not-allowed;pointer-events:none}
.btn-dark{background:var(--dark);color:#fff}
.btn-dark:hover{background:var(--dark2);transform:translateY(-1px);box-shadow:0 4px 14px rgba(15,17,21,.25)}
.btn-red{background:linear-gradient(135deg,#4ECDC4,#00E5A0);color:#fff}
.btn-red:hover{opacity:.9;transform:translateY(-1px);box-shadow:0 4px 14px rgba(232,65,66,.3)}
.btn-ghost{background:transparent;border:1.5px solid var(--b2);color:var(--ink2)}
.btn-ghost:hover{border-color:var(--ink3);color:var(--ink)}
.btn-sm{padding:5px 14px;font-size:10px}
.btn-xs{padding:3px 10px;font-size:9px}
.btn-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}

/* ALERTS */
.alert{padding:12px 16px;border-radius:var(--r);font-size:12px;margin-bottom:16px;line-height:1.6;border:1px solid;display:flex;gap:10px;align-items:flex-start}
.alert-icon{flex-shrink:0}
.alert-body{flex:1}
.alert-title{font-weight:600;margin-bottom:2px;font-family:var(--sans);font-size:12px}
.ai{background:#4ECDC406;border-color:#4ECDC425;color:#7f1d1e}
.ao{background:#16a34a06;border-color:#16a34a25;color:#14532d}
.aw{background:#d9770606;border-color:#d9770625;color:#78350f}
.ae{background:#4ECDC410;border-color:#4ECDC435;color:#7f1d1e}

/* PROVIDER */
.pt{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}
.po{padding:16px;border-radius:var(--r);cursor:pointer;border:1.5px solid var(--b2);background:var(--s2);transition:all .15s}
.po:hover{border-color:var(--ink3)}
.po.a{border-color:var(--red2);background:#4ECDC404}
.pon{font-family:var(--sans);font-weight:700;font-size:13px;margin-bottom:3px}
.po.a .pon{color:var(--red2)}
.pos{font-size:11px;color:var(--ink3)}

/* SCRAPE GRID */
.sg{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:9px;margin:16px 0}
.scard{padding:14px;border-radius:var(--r);background:var(--s1);border:1.5px solid var(--b);cursor:pointer;transition:all .2s;box-shadow:var(--sh)}
.scard:hover{border-color:var(--ink3);box-shadow:var(--sh2)}
.scard.done{border-color:var(--green);background:#16a34a04}
.scard.running{border-color:var(--yellow);animation:scpulse .9s infinite}
.scard.fail{border-color:var(--red);background:#4ECDC404}
@keyframes scpulse{0%,100%{border-color:var(--yellow)}50%{border-color:#d9770650}}
.sn{font-family:var(--sans);font-weight:700;font-size:13px;margin-bottom:2px}
.stype{font-family:var(--mono);font-size:9px;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px}
.sstar{font-family:var(--mono);font-size:11px;color:var(--yellow);margin-top:6px}
.srepo{font-size:10px;color:var(--ink3);margin-top:2px;font-family:var(--mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sst{font-family:var(--mono);font-size:10px;margin-top:6px}

/* TABLE */
.tw{overflow-x:auto;border-radius:var(--r);border:1px solid var(--b);background:var(--s1);box-shadow:var(--sh)}
table{width:100%;border-collapse:collapse;font-size:12px}
thead th{padding:10px 14px;text-align:left;font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:var(--ink3);background:var(--s2);border-bottom:1px solid var(--b);white-space:nowrap;font-weight:600}
tbody td{padding:12px 14px;border-bottom:1px solid var(--b);vertical-align:middle;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover td{background:var(--s2)}
tbody tr.sel td{background:#4ECDC406}
.ck{width:14px;height:14px;accent-color:var(--red2);cursor:pointer}

/* PILLS */
.pill{display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;font-family:var(--mono);font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap;border:1px solid}
.pn{background:var(--s3);color:var(--ink3);border-color:var(--b2)}
.ps{background:#d9770610;color:#92400e;border-color:#d9770630}
.pr{background:#16a34a10;color:#166534;border-color:#16a34a30}
.pb2{background:#4ECDC410;color:#7f1d1e;border-color:#4ECDC430}

/* PROGRESS */
.pgwrap{margin:12px 0}
.pglbl{display:flex;justify-content:space-between;font-family:var(--mono);font-size:10px;color:var(--ink3);margin-bottom:6px}
.pgbar{height:3px;background:var(--b);border-radius:2px;overflow:hidden}
.pgfill{height:100%;background:linear-gradient(135deg,#4ECDC4,#00E5A0);transition:width .4s ease;border-radius:2px}

/* EMAIL */
.ep{background:var(--bg);border:1.5px solid var(--b);border-radius:var(--r);padding:20px;font-size:13px;line-height:1.75;white-space:pre-wrap;max-height:280px;overflow-y:auto;font-family:var(--body)}
.em{font-family:var(--mono);font-size:11px;color:var(--ink3);margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--b);display:flex;flex-direction:column;gap:4px}
.em span{color:var(--ink);font-weight:500}

/* CHECKLIST */
.cklist{display:flex;flex-direction:column;gap:2px}
.crow{display:flex;align-items:center;gap:10px;font-size:12px;padding:6px 10px;border-radius:6px;transition:background .1s}
.crow:hover{background:var(--s2)}
.ci{font-size:12px;width:18px;text-align:center;flex-shrink:0}

/* EMPTY */
.empty{padding:56px 24px;text-align:center}
.empty-ico{font-size:36px;margin-bottom:14px;opacity:.35}
.empty-t{font-family:var(--sans);font-size:16px;font-weight:700;color:var(--ink2);margin-bottom:6px}
.empty-s{font-size:12px;color:var(--ink3);margin-bottom:20px;max-width:300px;margin-left:auto;margin-right:auto;line-height:1.6}

/* TOASTS */
.toasts{position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;align-items:flex-end}
.toast{display:flex;align-items:center;gap:10px;padding:11px 16px;border-radius:var(--r);background:var(--dark);color:#fff;font-family:var(--mono);font-size:11px;box-shadow:0 8px 28px rgba(0,0,0,.2);animation:tin .2s ease;pointer-events:all;max-width:340px}
@keyframes tin{from{transform:translateY(6px);opacity:0}to{transform:translateY(0);opacity:1}}
.tdot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.to{background:#86efac}.tw2{background:#fcd34d}.te{background:#fca5a5}

/* MISC */
hr{border:none;border-top:1px solid var(--b);margin:20px 0}
.stitle{font-family:var(--mono);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:var(--ink3);margin-bottom:12px}
@keyframes barGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes countUp{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.bar-grow{transform-origin:left;animation:barGrow .6s cubic-bezier(.16,1,.3,1) both}
.fade-up{animation:fadeUp .4s ease both}
.count-up{animation:countUp .5s cubic-bezier(.16,1,.3,1) both}
/* Bento grid */
.bento{display:grid;gap:12px}
.bento-2{grid-template-columns:1fr 1fr}
.bento-3{grid-template-columns:1fr 1fr 1fr}
.bento-4{grid-template-columns:repeat(4,1fr)}
.bento-hero{grid-column:1/-1}
.bento-wide{grid-column:span 2}
.bcell{background:var(--s1);border:1px solid var(--b);border-radius:var(--r2);padding:20px;box-shadow:var(--sh);transition:box-shadow .15s}
.bcell:hover{box-shadow:var(--sh2)}
.bcell-dark{background:var(--dark);border-color:var(--b)}
.bcell-accent{background:linear-gradient(135deg,#4ECDC408 0%,#4ECDC402 100%);border-color:#4ECDC420}
.muted{color:var(--ink3)}
code{background:var(--dark);color:#e2e8f0;padding:2px 7px;border-radius:4px;font-size:11px;font-family:var(--mono)}
.flex{display:flex}.gap8{gap:8px}.gap12{gap:12px}
.ic{align-items:center}.wrap{flex-wrap:wrap}
.mb8{margin-bottom:8px}.mb16{margin-bottom:16px}.mb24{margin-bottom:24px}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--b2);border-radius:3px}
`

let _tid=0
function useToast(){
  const [ts,setTs]=useState<{id:number;msg:string;type:'o'|'w'|'e'}[]>([])
  const toast=useCallback((msg:string,type:'o'|'w'|'e'='o')=>{
    const id=_tid++
    setTs(p=>[...p,{id,msg,type}])
    setTimeout(()=>setTs(p=>p.filter(t=>t.id!==id)),3500)
  },[])
  return{ts,toast}
}

export default function App(){
  const[tab,setTab]=useState('mission')
  const[leads,setLeads]=useState<Lead[]>([])
  const[health,setHealth]=useState<any>(null)
  const[hl,setHL]=useState(false)
  const[scrSt,setScrSt]=useState<Record<string,'idle'|'running'|'done'|'fail'>>({})
  const[scraped,setScraped]=useState<Record<string,any>>({})
  const[scrapeSource,setScrapeSource]=useState<'github'|'yc'|'hackernews'|'linkedin'>('github')
  const[sel,setSel]=useState<Set<string>>(new Set())
  const[genning,setGenning]=useState(false)
  const[genPct,setGenPct]=useState(0)
  const[regenning,setRegenning]=useState(false)
  const[regenProgress,setRegenProgress]=useState({done:0,total:0})
  const[sending,setSending]=useState(false)
  const[sendPct,setSendPct]=useState(0)
  const[preview,setPreview]=useState<Lead|null>(null)
  const[provider,setProvider]=useState<'gmail'>('gmail')
  // CRM search + filter + detail panel
  const[crmSearch,setCrmSearch]=useState('')
  const[crmFilter,setCrmFilter]=useState('all')
  const[detailLead,setDetailLead]=useState<Lead|null>(null)
  // Inbox state
  const[inboxLead,setInboxLead]=useState<Lead|null>(null)
  const[replyDraft,setReplyDraft]=useState<Record<string,string>>({})
  const[sendingReply,setSendingReply]=useState<string|null>(null)
  const[scanningInbox,setScanningInbox]=useState(false)
  const[lastScanResult,setLastScanResult]=useState<any>(null)
  const[validation,setValidation]=useState<any>(null)
  const[validating,setValidating]=useState(false)
  // Dynamic discovery
  const[discovered,setDiscovered]=useState<any[]>([])
  const[discovering,setDiscovering]=useState(false)
  const[searchMode,setSearchMode]=useState<'discover'|'static'>('discover')
  // Scraper filters
  const[filterMinStars,setFilterMinStars]=useState(0)
  const[filterMinForks,setFilterMinForks]=useState(0)
  const[filterMinMembers,setFilterMinMembers]=useState(0)
  const[filterMinScore,setFilterMinScore]=useState(0)
  const[filterSortBy,setFilterSortBy]=useState<'stars'|'forks'|'members'|'score'|'watchers'>('score')
  const[filterShowHasEmail,setFilterShowHasEmail]=useState(false)
  // Topic/niche filter — drives what gets discovered AND filters results
  const[activeTopics,setActiveTopics]=useState<Set<string>>(new Set(['crypto-traders','algo-trading','ai-trading','defi-protocols','crypto-kols']))
  const[activeCompanyTypes,setActiveCompanyTypes]=useState<Set<string>>(new Set())
  const[activeCompanySizes,setActiveCompanySizes]=useState<Set<string>>(new Set())
  const[showTopicPanel,setShowTopicPanel]=useState(false)
  const[log,setLog]=useState<Log[]>([])
  const logRef=useRef<HTMLDivElement>(null)
  const{ts,toast}=useToast()

  const addLog=useCallback((msg:string,type:Log['type']='i')=>{
    const t=new Date().toLocaleTimeString('en-US',{hour12:false})
    setLog(p=>[...p.slice(-300),{t,msg,type}])
    setTimeout(()=>logRef.current&&(logRef.current.scrollTop=logRef.current.scrollHeight),40)
  },[])

  useEffect(()=>{checkHealth()},[])
  useEffect(()=>{if(health?.airtable?.ok)loadLeads(true)},[health?.airtable?.ok])

  const scanInbox = async (days=60) => {
    setScanningInbox(true)
    addLog(`=== Scanning inbox — last ${days} days (read + unread) ===`, 'i')
    try {
      const r = await fetch('/api/scan-inbox',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({days})
      }).then(r=>r.json())
      if(!r.ok) throw new Error(r.error)
      setLastScanResult(r)
      addLog(`✓ Scanned ${r.scanned} messages — ${r.newReplies} new replies, ${r.newBounces} bounces detected`,'o')
      if(r.newReplies>0||r.newBounces>0){
        toast(`Found ${r.newReplies} repl${r.newReplies===1?'y':'ies'} + ${r.newBounces} bounce${r.newBounces===1?'':'s'}`,'o')
        await loadLeads()
      } else {
        toast('Inbox scanned — nothing new found','w')
      }
    }catch(e:any){
      addLog(`✗ Scan failed: ${e.message}`,'e')
      toast(e.message,'e')
    }
    setScanningInbox(false)
  }

  const checkHealth=async()=>{
    setHL(true)
    try{
      const r=await fetch('/api/health').then(r=>r.json())
      setHealth(r)
      if(r.airtable?.ok)addLog(`✓ Airtable — ${r.airtable.leadsCount} leads`,'o')
      else addLog(`✗ Airtable: ${r.airtable?.error||'not configured'}`,'e')
      if(r.github?.ok)addLog(`✓ GitHub — ${r.github.remaining}/${r.github.limit} req/hr`,'o')
      if(r.gmail?.ok)addLog(`✓ Gmail API — ${r.gmail.email}`,'o')
      else if(r.env?.gmailEmail)addLog('✗ Gmail API auth failed','e')
      if(r.anthropic?.ok)addLog('✓ Anthropic API ready','o')
    }catch(e:any){addLog(`✗ Health: ${e.message}`,'e')}
    setHL(false)
  }

  const loadLeads=async(silent=false)=>{
    if(!silent)addLog('Loading leads...','i')
    try{
      const r=await fetch('/api/airtable').then(r=>r.json())
      if(!r.ok){addLog(`✗ ${r.error}`,'e');return}
      const mapped=r.records.map(mapRecord)
      setLeads(mapped)
      if(!silent){addLog(`✓ ${mapped.length} leads`,'o');toast(`${mapped.length} leads loaded`)}
    }catch(e:any){addLog(`✗ ${e.message}`,'e')}
  }

  const discoverOrgs = async () => {
    setDiscovering(true)
    setDiscovered([])
    const sourceLabels: Record<string,string> = {
      github:'GitHub', yc:'YC + Show HN', hackernews:'Hacker News', linkedin:'LinkedIn'
    }
    addLog(`=== Discovering new leads from ${sourceLabels[scrapeSource]} ===`, 'i')
    try {
      let orgs: any[] = []
      if (scrapeSource === 'github') {
        const existingSlugs = leads.map(l=>{
          const url = l.githubOrgUrl||''
          const m = url.match(/github\.com\/([^\/\s]+)/i)
          return m?m[1].toLowerCase():''
        }).filter(Boolean)
        addLog(`  Excluding ${existingSlugs.length} orgs already in CRM`, 'i')
        const topicsQ = activeTopics.size ? `&topics=${Array.from(activeTopics).join(',')}` : ''
        const r = await fetch(`/api/discover?queries=8&limit=60&existing=${existingSlugs.join(',')}${topicsQ}`).then(r=>r.json())
        if (!r.ok) throw new Error(r.error)
        orgs = r.orgs
        if (r.queriesUsed?.length) addLog(`  Queries: ${r.queriesUsed.slice(0,3).join(' · ')}...`, 'i')
      } else if (scrapeSource === 'yc') {
        const topicsQ = activeTopics.size ? `?topics=${Array.from(activeTopics).join(',')}` : ''
        const r = await fetch(`/api/discover-ph${topicsQ}`).then(r=>r.json())
        if (!r.ok) throw new Error(r.error||'YC discovery failed')
        orgs = r.orgs
      } else if (scrapeSource === 'hackernews') {
        const topicsQ = activeTopics.size ? `?topics=${Array.from(activeTopics).join(',')}` : ''
        const r = await fetch(`/api/discover-hn${topicsQ}`).then(r=>r.json())
        if (!r.ok) throw new Error(r.error||'HN discovery failed')
        orgs = r.orgs
      } else if (scrapeSource === 'linkedin') {
        const topicsQ = activeTopics.size ? `?topics=${Array.from(activeTopics).join(',')}` : ''
        const r = await fetch(`/api/discover-li${topicsQ}`).then(r=>r.json())
        if (!r.ok) throw new Error(r.setup||r.error||'LinkedIn discovery failed')
        orgs = r.orgs
      }
      setDiscovered(orgs)
      addLog(`✓ Found ${orgs.length} new leads from ${sourceLabels[scrapeSource]}`, 'o')
    } catch(e: any) {
      addLog(`✗ Discovery failed: ${e.message}`, 'e')
      toast(e.message, 'e')
    }
    setDiscovering(false)
  }

  const scrapeOne = async (tgt: {org: string; name: string; type: string; website?: string; source?: string}) => {
    setScrSt(p => ({...p, [tgt.org]: 'running'}))
    try {
      const websiteParam = tgt.website ? `&website=${encodeURIComponent(tgt.website)}` : ''
      const typeParam   = tgt.type   ? `&type=${encodeURIComponent(tgt.type)}` : ''
      const nameParam   = tgt.name   ? `&name=${encodeURIComponent(tgt.name)}` : ''
      const sourceParam = `&source=${scrapeSource==='github'?'github':'yc'}`
      const r = await fetch(`/api/scrape?org=${tgt.org}${websiteParam}${typeParam}${nameParam}${sourceParam}`).then(r => r.json())
      if (!r.ok) throw new Error(r.error)
      setScraped(p => ({...p, [tgt.org]: r.data}))
      setScrSt(p => ({...p, [tgt.org]: 'done'}))
      addLog(`  ✓ ${tgt.name || tgt.org} ⭐${r.data.githubStars?.toLocaleString()}`, 'o')
    } catch(e: any) {
      setScrSt(p => ({...p, [tgt.org]: 'fail'}))
      addLog(`  ✗ ${tgt.name || tgt.org}: ${e.message}`, 'e')
    }
  }

  const scrapeAll = async () => {
    const targets = searchMode === 'discover' && discovered.length > 0
      ? discovered.map(o => ({ org: o.org, name: o.name, type: o.type, website: o.website }))
      : TARGETS
    const srcLabel = scrapeSource==='github'?'GitHub':scrapeSource==='yc'?'YC/ShowHN':scrapeSource==='hackernews'?'HN':'LinkedIn'
    addLog(`=== Enriching ${targets.length} leads from ${srcLabel} ===`, 'i')
    const rl = await fetch('/api/scrape?org=ratelimit').then(r=>r.json()).catch(()=>null)
    if (rl?.ok) addLog(`GitHub: ${rl.remaining}/${rl.limit} req remaining`, rl.remaining<40?'w':'i')
    for (const tgt of targets) {
      if (scrSt[tgt.org] === 'done') continue
      await scrapeOne(tgt)
      await new Promise(r => setTimeout(r, 250))
    }
    addLog('=== Scrape complete ===', 'o')
    toast(`${Object.values(scrSt).filter(s=>s==='done').length} orgs scraped`)
  }

  const saveToAirtable=async()=>{
    const toSave=Object.values(scraped)
    if(!toSave.length){toast('Nothing scraped yet','w');return}
    addLog(`Saving ${toSave.length} leads with contact enrichment...`,'i')
    let ok=0
    for(const d of toSave){
      try{
        const fields: Record<string,any> = {
          "Company":          d.company,
          "Website":          d.website||'',
          "GitHub Org URL":   d.githubOrgUrl,
          "GitHub Stars":     d.githubStars||0,
          "GitHub Forks":     d.githubForks||0,
          "GitHub Watchers":  d.githubWatchers||0,
          "Org Members":      d.orgMembers||0,
          "Top Repo Contributors": d.contributors||0,
          "Open Issues":      d.openIssues||0,
          "Repo Count":       d.repoCount||0,
          "Top Repos":        d.topRepos||'',
          "Lead Score":       d.leadScore||0,
          "Company Type":     d.companyType,
          "AI Tools Used":    d.aiTools,
          "Status":           'New',
          "Sequence Status":  'Cold',
          "Source":           scrapeSource==='github'?'GitHub':scrapeSource==='yc'?'YC Companies':scrapeSource==='hackernews'?'Hacker News':'LinkedIn',
          "Date Added":       new Date().toISOString().split('T')[0],
          "Personalization Notes": d.description||'',
        }
        if(d.contactName)  fields['Contact Name']  = d.contactName
        if(d.contactEmail) fields['Contact Email'] = d.contactEmail
        if(d.contactTitle) fields['Job Title'] = d.contactTitle + (d.contactConfidence==='inferred'?' (inferred)':' (verified)')
        if(d.contactConfidence){
          const confMap: Record<string,string> = {
            'verified':    'GitHub public',
            'inferred':    'Pattern inferred',
            'org-contact': 'Org contact',
          }
          const hunterConf = typeof d.contactConfidence==='string'&&d.contactConfidence.startsWith('hunter-')
          fields['Email Confidence'] = hunterConf ? 'Hunter verified' : (confMap[d.contactConfidence]||'Unknown')
        }

        const r=await fetch('/api/airtable',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'create',fields})}).then(r=>r.json())
        if(r.ok){
          ok++
          const emailNote = d.contactEmail
            ? ` · ${d.contactConfidence==='verified'?'✓':'~'} ${d.contactEmail}`
            : ' · no email found'
          addLog(`  ✓ ${d.company}${emailNote}`,'o')
        }
        else addLog(`  ✗ ${d.company}: ${r.error}`,'e')
      }catch(e:any){addLog(`  ✗ ${e.message}`,'e')}
      await new Promise(r=>setTimeout(r,200))
    }
    const withEmail = Object.values(scraped).filter((d:any)=>d.contactEmail).length
    addLog(`Saved ${ok}/${toSave.length} — ${withEmail} with emails (${Object.values(scraped).filter((d:any)=>d.contactConfidence==='verified').length} verified, ${Object.values(scraped).filter((d:any)=>d.contactConfidence==='inferred').length} inferred)`,ok===toSave.length?'o':'w')
    toast(`${ok} leads saved · ${withEmail} emails found`,ok>0?'o':'e')
    await loadLeads(true)
  }

  const genEmails=async()=>{
    const all=leads.filter(l=>!l.emailBody&&(sel.size===0||sel.has(l.id)))
    // Gate: only generate for leads that have a verified/enriched contact email
    const targets=all.filter(l=>l.contactEmail&&l.contactEmail.includes('@'))
    const skipped=all.length-targets.length
    if(!targets.length){
      if(skipped>0) toast(`${skipped} lead${skipped===1?'':'s'} have no contact email — enrich first`,'w')
      else toast('No leads need emails','w')
      return
    }
    if(skipped>0) addLog(`  ⚠ Skipping ${skipped} leads with no contact email (enrich first)`,'w')
    setGenning(true);setGenPct(0)
    addLog(`=== Generating ${targets.length} emails + sequences ===`,'i')
    for(let i=0;i<targets.length;i++){
      const lead=targets[i]
      addLog(`Writing sequence for ${lead.company}...`,'i')
      try{
        const r=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({lead,senderName:'Brandon @ TradeCafe',mode:'all'})}).then(r=>r.json())
        if(!r.ok)throw new Error(r.error)
        // Save cold email + both follow-ups in one Airtable update
        await fetch('/api/airtable',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'update',recordId:lead.id,fields:{
            "Email Subject":    r.subject,
            "Email Body":       r.body,
            "Follow-up 1 Subject": r.followUp1Subject||'',
            "Follow-up 1 Body":    r.followUp1Body||'',
            "Follow-up 2 Subject": r.followUp2Subject||'',
            "Follow-up 2 Body":    r.followUp2Body||'',
          }})})
        setLeads(p=>p.map(l=>l.id===lead.id?{...l,
          emailSubject:r.subject,emailBody:r.body,
          followUp1Subject:r.followUp1Subject||'',followUp1Body:r.followUp1Body||'',
          followUp2Subject:r.followUp2Subject||'',followUp2Body:r.followUp2Body||'',
        }:l))
        addLog(`  ✓ Cold: "${r.subject}"`,'o')
        if(r.followUp1Subject) addLog(`  ✓ FU1: "${r.followUp1Subject}"`,'o')
        if(r.followUp2Subject) addLog(`  ✓ FU2: "${r.followUp2Subject}"`,'o')
      }catch(e:any){addLog(`  ✗ ${lead.company}: ${e.message}`,'e')}
      setGenPct(Math.round(((i+1)/targets.length)*100))
      await new Promise(r=>setTimeout(r,800))
    }
    setGenning(false)
    addLog('=== Sequences complete ===','o')
    toast('3-part sequences generated and saved','o')
  }

  const regenAllEmails=async()=>{
    const targets=leads.filter(l=>l.emailBody) // only leads that already have emails
    if(!targets.length){toast('No emails to regenerate','w');return}
    if(!confirm(`Regenerate emails for all ${targets.length} leads using updated prompt? This will overwrite existing emails.`))return
    setRegenning(true)
    setRegenProgress({done:0,total:targets.length})
    addLog(`=== Regenerating ${targets.length} email sequences (new prompt: no dashes, call CTA) ===`,'i')
    let done=0,errors=0
    // Process in batches of 8 via regenerate API
    const batchSize=8
    for(let i=0;i<targets.length;i+=batchSize){
      const batch=targets.slice(i,i+batchSize)
      try{
        const r=await fetch('/api/regenerate',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({recordIds:batch.map(l=>l.id),senderName:'Brandon @ TradeCafe'})
        }).then(r=>r.json())
        if(r.ok){
          done+=r.results.filter((x:any)=>x.ok).length
          errors+=r.results.filter((x:any)=>!x.ok).length
          r.results.forEach((x:any)=>{
            if(x.ok) addLog(`  ✓ ${x.company}`,'o')
            else addLog(`  ✗ ${x.company}: ${x.error}`,'e')
          })
        }
      }catch(e:any){
        addLog(`  Batch error: ${e.message}`,'e')
        errors+=batch.length
      }
      setRegenProgress({done:Math.min(i+batchSize,targets.length),total:targets.length})
      if(i+batchSize<targets.length) await new Promise(r=>setTimeout(r,1000))
    }
    setRegenning(false)
    addLog(`=== Regeneration complete: ${done} updated, ${errors} errors ===`,errors?'w':'o')
    toast(`${done} emails regenerated${errors?' · '+errors+' errors':''}`, errors?'w':'o')
    await loadLeads(true)
  }

  const validateLeads=async()=>{
    const targets=leads.filter(l=>l.emailBody&&l.emailSubject&&(sel.size===0||sel.has(l.id)))
    if(!targets.length){toast('No leads with emails generated yet','w');return}
    setValidating(true)
    setValidation(null)
    try{
      const r=await fetch('/api/validate-emails',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({leads:targets})}).then(r=>r.json())
      if(r.ok){
        setValidation(r)
        addLog(`Validation complete: ${r.summary.willSend} will send, ${r.summary.blocked} blocked`,'o')
        if(r.summary.personal>0) addLog(`  ✗ ${r.summary.personal} personal emails (Gmail/Hey/etc) — find company emails via Hunter.io`,'w')
        if(r.summary.edu>0)      addLog(`  ✗ ${r.summary.edu} education emails blocked`,'w')
        if(r.summary.missing>0)  addLog(`  ✗ ${r.summary.missing} leads missing contact email`,'w')
        if(r.summary.role>0)     addLog(`  ⚠ ${r.summary.role} role-based emails (hello@, info@) — will send but lower reply rate`,'w')
      }
    }catch(e:any){addLog(`✗ Validation: ${e.message}`,'e')}
    setValidating(false)
  }

  // Warmup schedule: week → daily send limit + cooldown between emails
  const WARMUP = [
    {dailyMax:10, cooldownMs:90000},   // Week 1 — very gentle
    {dailyMax:20, cooldownMs:75000},   // Week 2
    {dailyMax:35, cooldownMs:60000},   // Week 3
    {dailyMax:50, cooldownMs:45000},   // Week 4
    {dailyMax:75, cooldownMs:30000},   // Week 5
    {dailyMax:100,cooldownMs:20000},   // Week 6+ — fully warmed
  ]
  const getWarmup = () => {
    const days = Math.floor((Date.now() - new Date('2026-03-28').getTime()) / 86400000)
    const week = Math.max(1, Math.min(6, Math.ceil((days + 1) / 7)))
    return { ...WARMUP[week-1], week }
  }

  const runCampaign=async()=>{
    if(!validation){
      toast('Run validation first to check email quality','w')
      await validateLeads()
      return
    }
    const w = getWarmup()
    const today = new Date().toISOString().split('T')[0]
    const blockedIds = new Set((validation?.results||[]).filter((r:any)=>!r.willSend).map((r:any)=>r.id))
    const ready = leads.filter(l=>
      l.emailBody && l.emailSubject && l.contactEmail && l.status==='New' &&
      !blockedIds.has(l.id) && (sel.size===0||sel.has(l.id))
    )
    if(!ready.length){toast('No sendable leads — all blocked by validation or missing emails','w');return}

    // Warmup daily budget check
    const sentToday = leads.filter(l=>l.status==='Email Sent'&&l.lastContacted===today).length
    const budget = w.dailyMax - sentToday
    if(budget<=0){
      toast(`Daily limit reached (${w.dailyMax}/day · Week ${w.week}). Come back tomorrow.`,'w')
      addLog(`⚠ Week ${w.week} warmup limit: ${w.dailyMax}/day. ${sentToday} sent today already.`,'w')
      return
    }

    const batch    = ready.slice(0, budget)
    const deferred = ready.length - batch.length
    const sec      = w.cooldownMs/1000
    const estMin   = Math.ceil((batch.length * sec)/60)

    if(batch.length > 5 && !confirm(
      `Send ${batch.length} emails now?\n` +
      (deferred>0?`${deferred} leads deferred to tomorrow (Week ${w.week} limit: ${w.dailyMax}/day).\n`:``) +
      `Cooldown: ${sec}s between sends (~${estMin} min total).\nContinue?`
    )) return

    setSending(true);setSendPct(0)
    addLog(`=== Campaign: ${batch.length} leads · ${sec}s cooldown · Week ${w.week} (${w.dailyMax}/day) ===`,'i')
    if(deferred>0) addLog(`  ⚠ ${deferred} leads deferred to tomorrow`,'w')

    for(let i=0;i<batch.length;i++){
      const lead=batch[i]
      addLog(`→ ${lead.company} (${lead.contactEmail})`,'i')
      try{
        let msgId=`sent-${Date.now()}`
        if(provider==='gmail'){
          const r=await fetch('/api/send',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({to:lead.contactEmail,subject:lead.emailSubject,body:lead.emailBody,recordId:lead.id})
          }).then(r=>r.json())
          if(!r.ok){
            if(r.bounced) setLeads(p=>p.map(l=>l.id===lead.id?{...l,bounced:true}:l))
            throw new Error(r.error)
          }
          msgId=r.messageId
        }
        await fetch('/api/airtable',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'update',recordId:lead.id,fields:{
            'Status':'Email Sent','Sequence Status':'Email 1 Sent',
            'Last Contacted':today,'Follow Up #':1
          }})})
        await fetch('/api/airtable',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'log',fields:{
            'Campaign ID':`CAM-${Date.now()}`,'Company':lead.company,
            'Contact Email':lead.contactEmail,'Subject':lead.emailSubject,
            'Sequence Step':'Cold Email #1','Sent At':new Date().toISOString(),
            'Message ID':msgId,'Result':'Sent'
          }})})
        setLeads(p=>p.map(l=>l.id===lead.id?{...l,status:'Email Sent'}:l))
        addLog(`  ✓ Sent to ${lead.company}`,'o')
      }catch(e:any){addLog(`  ✗ ${lead.company}: ${e.message}`,'e')}
      setSendPct(Math.round(((i+1)/batch.length)*100))
      if(i<batch.length-1){
        addLog(`  ⏳ ${sec}s cooldown (Week ${w.week} warmup)...`,'w')
        await new Promise(r=>setTimeout(r,w.cooldownMs))
      }
    }
    setSending(false)
    const deferNote = deferred>0?` · ${deferred} deferred`:''
    toast(`Campaign complete — ${batch.length} sent${deferNote}`)
    addLog(`=== Done: ${batch.length} sent${deferNote} · ${budget-batch.length} budget remaining today ===`,'o')
  }

  const stats={
    total:leads.length,
    hasEmail:leads.filter(l=>l.emailBody).length,
    hasContact:leads.filter(l=>l.contactEmail).length,
    sent:leads.filter(l=>l.status==='Email Sent').length,
    replied:leads.filter(l=>l.status==='Replied').length,
    booked:leads.filter(l=>l.status==='Booked Call').length,
  }
  const scCnt=Object.values(scrSt).filter(s=>s==='done').length
  const readyCnt=leads.filter(l=>l.emailBody&&l.emailSubject&&l.contactEmail&&l.status==='New').length

  const hSt=(h:any)=>!h?'unknown':h.ok?'ok':'err'
  const hLbl=(h:any)=>!h?'Not checked':h.ok?'Connected':'Error'

  const Logbox=({maxH='180px'}:{maxH?:string})=>(
    <div className="logbox" ref={logRef} style={{maxHeight:maxH}}>
      {log.length===0
        ?<div className="lempty">Log appears here</div>
        :log.map((l,i)=>(
          <div key={i} className="ll">
            <span className="lt">{l.t}</span>
            <span className={`lm l${l.type}`}>{l.msg}</span>
          </div>
        ))
      }
    </div>
  )

  const dotCls=(ok:boolean|undefined,loading:boolean)=>loading?'spin':ok?'ok':ok===false?'err':''

  return(
    <>
      <style dangerouslySetInnerHTML={{__html:CSS}}/>
      <div className="toasts">
        {ts.map(t=>(
          <div key={t.id} className="toast">
            <div className={`tdot t${t.type}`}/>
            {t.msg}
          </div>
        ))}
      </div>
      <div className="shell">

        {/* TOPBAR */}
        <div className="topbar">
          <div className="brand">
            <svg width="22" height="22" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
              <polygon points="18,2 32,10 32,14 18,22 4,14 4,10" fill="#7B61FF" opacity="0.55"/>
              <polygon points="18,8 32,16 32,20 18,28 4,20 4,16" fill="#00E5A0" opacity="0.75"/>
              <polygon points="18,14 32,22 32,26 18,34 4,26 4,22" fill="#4ECDC4" opacity="1.0"/>
            </svg>
            <div className="brand-name">TradeCafe</div>
            <div className="brand-tag">BD Agent</div>
          </div>
          <div className="topbar-r">
            <button className="btn btn-ghost btn-xs" onClick={checkHealth} disabled={hl}>{hl?'…':'↻ Refresh'}</button>
          </div>
        </div>

        {/* NAV */}
        <div className="nav">
          {[
            {id:'mission',label:'Mission Control'},
            {id:'scrape',label:'Scrape',num:scCnt||null},
            {id:'crm',label:'CRM',num:stats.total||null},
            {id:'generate',label:'Generate',num:stats.hasEmail||null},
            {id:'send',label:'Send',num:readyCnt||null,warn:readyCnt===0&&stats.hasEmail>0&&stats.hasContact>0},
            {id:'inbox',label:'Inbox',num:stats.replied||null,warn:false},
            {id:'analytics',label:'Analytics',num:null,warn:false},
          ].map(({id,label,num,warn})=>(
            <button key={id} className={`nb ${tab===id?'active':''}`} onClick={()=>setTab(id)}>
              {label}
              {num!=null&&<span className={`nn ${warn?'warn':''}`}>{num}</span>}
            </button>
          ))}
        </div>

        {/* STATS STRIP */}
        <div className="strip">
          <div className="strip-inner">
            {[
              {lbl:'Total Leads',val:stats.total,ico:'◈'},
              {lbl:'Emails Written',val:stats.hasEmail,ico:'✦'},
              {lbl:'Contacts Added',val:stats.hasContact,ico:'@'},
              {lbl:'Emails Sent',val:stats.sent,ico:'▶',live:stats.sent>0},
              {lbl:'Replies',val:stats.replied,ico:'↩',live:stats.replied>0},
            ].map(({lbl,val,ico,live},i)=>(
              <div key={lbl} className="scell" style={i===4?{borderRight:'none'}:{}}>
                <div className="sico">{ico}</div>
                <div>
                  <div className={`sval ${val>0&&!live?'on':''}${live?'live':''}`}>{val}</div>
                  <div className="slbl">{lbl}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="page">

          {/* ══ MISSION CONTROL ══ */}
          {tab==='mission'&&<>
            <div className="ph">
              <div className="ph-t">Mission Control</div>
              <div className="ph-s">Live system health · {stats.total} leads · {stats.sent} sent · {stats.replied} replied</div>
            </div>

            {/* ── BENTO ROW 1: Today's Queue hero + Warmup ── */}
            {(()=>{
              const today       = new Date().toISOString().split('T')[0]
              const WARMUP_LIMS = [10,20,35,50,75,100]
              const days        = Math.floor((Date.now()-new Date('2026-03-28').getTime())/86400000)
              const weekNum     = Math.max(1,Math.min(6,Math.ceil((days+1)/7)))
              const dailyMax    = WARMUP_LIMS[weekNum-1]
              const sentToday   = leads.filter(l=>l.status==='Email Sent'&&l.lastContacted===today).length
              const budget      = Math.max(0,dailyMax-sentToday)
              const fu1Due      = leads.filter(l=>{
                if(l.sequenceStatus!=='Email 1 Sent'||!l.followUp1Body) return false
                const d=l.lastContacted?Math.floor((Date.now()-new Date(l.lastContacted).getTime())/86400000):0
                return d>=5
              }).length
              const fu2Due      = leads.filter(l=>{
                if(l.sequenceStatus!=='Follow-up 1 Sent'||!l.followUp2Body) return false
                const d=l.lastContacted?Math.floor((Date.now()-new Date(l.lastContacted).getTime())/86400000):0
                return d>=7
              }).length
              const needsEmail  = leads.filter(l=>!l.emailBody&&l.contactEmail&&!l.disqualified).length
              const needsContact= leads.filter(l=>!l.contactEmail&&!l.disqualified).length
              const budgetPct   = Math.min(100,Math.round(sentToday/dailyMax*100))

              return(
                <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12,marginBottom:12}}>

                  {/* Today's Queue — wide bento cell */}
                  <div className="bcell bcell-accent" style={{padding:0,overflow:'hidden'}}>
                    <div style={{padding:'20px 24px',borderBottom:'1px solid #4ECDC418'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                        <div>
                          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:4}}>Today's Queue</div>
                          <div style={{fontFamily:'var(--sans)',fontWeight:800,fontSize:22,letterSpacing:'-.5px',color:'var(--ink)'}}>
                            {budget===0?'Daily limit reached':budget===1?'1 email left today':`${budget} emails left today`}
                          </div>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',marginBottom:4}}>Week {weekNum} warmup</div>
                          <div style={{fontFamily:'var(--sans)',fontWeight:700,fontSize:14,color:budget===0?'var(--red)':'var(--green)'}}>{sentToday}/{dailyMax}/day</div>
                        </div>
                      </div>
                      {/* Warmup progress bar */}
                      <div style={{height:6,background:'var(--b2)',borderRadius:3,overflow:'hidden',marginBottom:12}}>
                        <div className="bar-grow" style={{height:'100%',width:`${budgetPct}%`,background:budget===0?'#4ECDC4':'#16a34a',borderRadius:3}}/>
                      </div>
                    </div>
                    {/* 4-stat grid */}
                    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)'}}>
                      {[
                        {lbl:'Send Budget',val:budget,sub:`of ${dailyMax} today`,col:budget===0?'var(--red)':budget<5?'var(--yellow)':'var(--green)',act:()=>setTab('send')},
                        {lbl:'Ready to Send',val:readyCnt,sub:'passed validation',col:readyCnt>0?'var(--ink)':'var(--ink4)',act:()=>setTab('send')},
                        {lbl:'FU1 Due',val:fu1Due,sub:'5+ days no reply',col:fu1Due>0?'var(--yellow)':'var(--ink4)',act:null},
                        {lbl:'FU2 Due',val:fu2Due,sub:'7+ days since FU1',col:fu2Due>0?'#d97706':'var(--ink4)',act:null},
                      ].map(({lbl,val,sub,col,act},i,arr)=>(
                        <div key={lbl}
                          onClick={act||undefined}
                          style={{padding:'16px 20px',borderRight:i<arr.length-1?'1px solid #4ECDC410':'none',cursor:act?'pointer':'default',transition:'background .1s'}}
                          onMouseEnter={act?e=>(e.currentTarget.style.background='#4ECDC408'):undefined}
                          onMouseLeave={act?e=>(e.currentTarget.style.background=''):undefined}>
                          <div style={{fontFamily:'var(--sans)',fontWeight:800,fontSize:28,letterSpacing:'-1.5px',color:val>0?col:'var(--ink4)',lineHeight:1}}>{val}</div>
                          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink3)',textTransform:'uppercase',letterSpacing:'.8px',marginTop:5}}>{lbl}</div>
                          <div style={{fontFamily:'var(--body)',fontSize:10,color:'var(--ink4)',marginTop:2}}>{sub}</div>
                        </div>
                      ))}
                    </div>
                    {/* Footer bar */}
                    {(needsEmail>0||needsContact>0)&&(
                      <div style={{padding:'10px 24px',borderTop:'1px solid #4ECDC418',display:'flex',gap:20,flexWrap:'wrap',background:'#4ECDC405'}}>
                        {needsEmail>0&&<span onClick={()=>setTab('generate')} style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--yellow)',cursor:'pointer'}}><strong>{needsEmail}</strong> need email written</span>}
                        {leads.filter(l=>l.bounced).length>0&&<span onClick={()=>{setTab('crm');setCrmFilter('bounced')}} style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--red)',cursor:'pointer'}}><strong>{leads.filter(l=>l.bounced).length}</strong> bounced</span>}
                        {stats.replied>0&&<span onClick={()=>setTab('inbox')} style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--green)',cursor:'pointer'}}><strong>{stats.replied}</strong> repl{stats.replied===1?'y':'ies'}</span>}
                        {leads.filter(l=>l.bounced).length>0&&<span onClick={()=>{setTab('crm');setCrmFilter('bounced')}} style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--red)',cursor:'pointer'}}><strong>{leads.filter(l=>l.bounced).length}</strong> bounced</span>}
                        {leads.filter(l=>l.status==='Replied').length>0&&<span onClick={()=>setTab('inbox')} style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--green)',cursor:'pointer'}}><strong>{leads.filter(l=>l.status==='Replied').length}</strong> repl{leads.filter(l=>l.status==='Replied').length===1?'y':'ies'}</span>}
                        {needsContact>0&&<span onClick={()=>setTab('crm')} style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)',cursor:'pointer'}}><strong>{needsContact}</strong> missing contact</span>}
                      </div>
                    )}
                  </div>

                  {/* Warmup week tracker */}
                  <div className="bcell" style={{display:'flex',flexDirection:'column',gap:12}}>
                    <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'1px'}}>Domain Warmup</div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
                      {[10,20,35,50,75,100].map((lim,i)=>(
                        <div key={i} style={{
                          padding:'8px 6px',borderRadius:'var(--r)',textAlign:'center',
                          background:i+1<weekNum?'#16a34a18':i+1===weekNum?'#4ECDC415':'var(--s2)',
                          border:`1px solid ${i+1<weekNum?'#16a34a30':i+1===weekNum?'var(--red2)':'var(--b)'}`,
                        }}>
                          <div style={{fontFamily:'var(--mono)',fontSize:11,fontWeight:700,color:i+1<weekNum?'var(--green)':i+1===weekNum?'var(--red2)':'var(--ink4)'}}>{lim}</div>
                          <div style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--ink4)',marginTop:1}}>W{i+1}{i+1===weekNum?' ←':''}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{fontFamily:'var(--body)',fontSize:11,color:'var(--ink3)',lineHeight:1.5}}>
                      Week {weekNum} · {dailyMax}/day · {[90,75,60,45,30,20][weekNum-1]}s cooldown
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={()=>setTab('send')}>Open Send tab →</button>
                  </div>
                </div>
              )
            })()}

            {/* ── BENTO ROW 2: Health cards (2×2) + Sequence pipeline ── */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12,marginBottom:12}}>
              {[
                {key:'airtable',ico:'🗄',name:'Airtable',
                  detail:health?.airtable?.ok?`${health.airtable.leadsCount} leads`:health?.airtable?.error||'Not connected',
                  ok:health?.airtable?.ok, h:health?.airtable},
                {key:'gmail',ico:'✉',name:'Gmail API',
                  detail:health?.gmail?.ok?health.gmail.email:health?.env?.gmailEmail?'Auth failed':'Not configured',
                  ok:health?.gmail?.ok, h:health?.gmail},
                {key:'github',ico:'⑂',name:'GitHub API',
                  detail:health?.github?.ok?`${health.github.remaining} req/hr left`:'Unavailable',
                  ok:health?.github?.ok, h:health?.github},
                {key:'anthropic',ico:'◆',name:'Anthropic',
                  detail:health?.env?.anthropic?'claude-sonnet-4 ready':'API key not set',
                  ok:!!health?.env?.anthropic, h:health?.anthropic},
              ].map(({key,ico,name,detail,ok,h})=>{
                const st=hl?'spin':hSt(h)
                return(
                  <div key={key} className="bcell" style={{padding:'16px 18px',position:'relative',overflow:'hidden'}}>
                    <div className={`hbar ${st}`} style={{position:'absolute',top:0,left:0,right:0,height:2}}/>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                      <span style={{fontSize:18}}>{ico}</span>
                      <span className={`hbadge ${st}`} style={{fontSize:9,padding:'2px 8px'}}>{hl?'…':hLbl(h)}</span>
                    </div>
                    <div style={{fontFamily:'var(--sans)',fontWeight:700,fontSize:13,color:'var(--ink)',marginBottom:4}}>{name}</div>
                    <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)',lineHeight:1.4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'100%'}}>{detail}</div>
                  </div>
                )
              })}
            </div>

            {/* ── BENTO ROW 3: Campaign pipeline (full width) ── */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:0,background:'var(--s1)',border:'1px solid var(--b)',borderRadius:'var(--r2)',overflow:'hidden',marginBottom:12,boxShadow:'var(--sh)'}}>
              {[
                {n:'01',lbl:'Leads Scraped',val:stats.total,tot:Math.max(stats.total,1),sub:`${stats.total} in CRM`,cta:'Discover →',t:'scrape'},
                {n:'02',lbl:'Sequences Written',val:stats.hasEmail,tot:Math.max(stats.total,1),sub:`${Math.max(stats.total-stats.hasEmail,0)} remaining`,cta:'Generate →',t:'generate'},
                {n:'03',lbl:'Contacts Found',val:stats.hasContact,tot:Math.max(stats.total,1),sub:'with email addresses',cta:'View CRM →',t:'crm'},
                {n:'04',lbl:'Emails Sent',val:stats.sent,tot:Math.max(stats.total,1),sub:`${stats.replied} replied · ${stats.booked} booked`,cta:'Send more →',t:'send'},
              ].map(({n,lbl,val,tot,sub,cta,t},i,arr)=>{
                const pct=tot>0?Math.min(Math.round((val/tot)*100),100):0
                const done=pct===100&&val>0
                return(
                  <div key={n} className="pipe" style={{borderRight:i<arr.length-1?'1px solid var(--b)':'none',position:'relative'}}>
                    <div className="pipe-n">Step {n}</div>
                    <div className="pipe-lbl">{lbl}</div>
                    <div className={`pipe-val ${done?'done':val>0?'on':''}`}>{val}</div>
                    <div className="pipe-sub">{sub}</div>
                    <button className="pipe-cta" onClick={()=>t==='crm'?window.open('https://airtable.com/appCYgmFc8vTfwyv1','_blank'):setTab(t)}>{cta}</button>
                    <div className="pipe-bar" style={{width:`${pct}%`}}/>
                    {done&&<div className="pipe-check on">✓</div>}
                  </div>
                )
              })}
            </div>

            {/* ── BENTO ROW 4: Quick actions + Discord + Env ── */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>

              {/* Quick actions */}
              <div className="bcell" style={{padding:0,overflow:'hidden'}}>
                <div style={{padding:'14px 18px',borderBottom:'1px solid var(--b)',fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'1px'}}>Quick Actions</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1,background:'var(--b)'}}>
                  {[
                    {ico:'↻',lbl:'Refresh Systems',act:checkHealth,dis:hl},
                    {ico:'📬',lbl:'Scan Inbox',act:()=>scanInbox(60),dis:scanningInbox,prime:false},
                    {ico:'⭐',lbl:'Discover Leads',act:()=>setTab('scrape'),dis:false},
                    {ico:'✦',lbl:'Generate Emails',act:()=>setTab('generate'),dis:!health?.env?.anthropic},
                    {ico:'▶',lbl:'Send Campaign',act:()=>setTab('send'),dis:readyCnt===0,prime:readyCnt>0},
                    {ico:'◈',lbl:'View CRM',act:()=>setTab('crm'),dis:false},
                    {ico:'↗',lbl:'Open Airtable',act:()=>window.open('https://airtable.com/appCYgmFc8vTfwyv1','_blank'),dis:false},
                  ].map(({ico,lbl,act,dis,prime}:any)=>(
                    <button key={lbl}
                      onClick={act} disabled={dis}
                      style={{display:'flex',alignItems:'center',gap:10,padding:'14px 16px',background:prime?'#4ECDC408':'var(--s1)',border:'none',cursor:dis?'not-allowed':'pointer',textAlign:'left',transition:'background .1s',opacity:dis?.5:1}}
                      onMouseEnter={e=>{if(!dis)(e.currentTarget as HTMLButtonElement).style.background=prime?'#4ECDC415':'var(--s2)'}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background=prime?'#4ECDC408':'var(--s1)'}}>
                      <span style={{fontSize:16,color:prime?'var(--red2)':'var(--ink3)'}}>{ico}</span>
                      <span style={{fontFamily:'var(--body)',fontSize:12,fontWeight:600,color:prime?'var(--red2)':'var(--ink)'}}>{lbl}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Env + Discord */}
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {/* Env vars */}
                <div className="bcell" style={{padding:'14px 18px',flex:1}}>
                  <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:12}}>Environment</div>
                  <div style={{display:'flex',flexDirection:'column',gap:7}}>
                    {[
                      {key:'AIRTABLE_API_KEY',     ok:!!health?.env?.airtable,     hint:'airtable.com/create/tokens'},
                      {key:'ANTHROPIC_API_KEY',     ok:!!health?.env?.anthropic,    hint:'console.anthropic.com'},
                      {key:'GOOGLE_CLIENT_ID + PASSWORD', ok:!!health?.gmail?.ok,          hint:'Gmail API credentials'},
                      {key:'GITHUB_TOKEN',          ok:!!health?.env?.githubToken,  hint:'5,000 req/hr vs 60 anon'},
                      {key:'HUNTER_API_KEY',        ok:!!health?.env?.hunterKey,    hint:'Optional · hunter.io'},
                      {key:'DISCORD_WEBHOOK_URL',   ok:!!health?.env?.discordWebhook,hint:'Optional · Discord channel'},
                    ].map(({key,ok,hint})=>(
                      <div key={key} style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{color:ok?'var(--green)':'var(--ink4)',fontSize:12,flexShrink:0}}>{ok?'✓':'○'}</span>
                        <span style={{fontFamily:'var(--mono)',fontSize:10,color:ok?'var(--ink)':'var(--ink3)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{key}</span>
                        {!ok&&<span style={{fontFamily:'var(--body)',fontSize:9,color:'var(--ink4)',flexShrink:0}}>{hint}</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Discord */}
                {!health?.env?.discordWebhook?(
                  <div className="bcell" style={{padding:'14px 18px',background:'#d9770608',borderColor:'#d9770625'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                      <span style={{fontSize:16}}>🔔</span>
                      <span style={{fontFamily:'var(--sans)',fontWeight:700,fontSize:12,color:'var(--ink)'}}>Discord Alerts</span>
                      <span style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--yellow)',background:'#d9770615',padding:'1px 6px',borderRadius:4}}>NOT SET</span>
                    </div>
                    <div style={{fontFamily:'var(--body)',fontSize:11,color:'var(--ink3)',lineHeight:1.5,marginBottom:10}}>
                      Get instant reply alerts and daily cron summaries in Discord.
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <a href="https://discord.com" target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-xs" style={{textDecoration:'none'}}>Open Discord</a>
                      <button className="btn btn-ghost btn-xs" onClick={()=>fetch('/api/notify').then(r=>r.json()).then(d=>toast(d.message||'Test sent','o'))}>Test webhook</button>
                    </div>
                  </div>
                ):(
                  <div className="bcell" style={{padding:'14px 18px',background:'#16a34a06',borderColor:'#16a34a20'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:16}}>🔔</span>
                        <div>
                          <div style={{fontFamily:'var(--sans)',fontWeight:700,fontSize:12,color:'var(--ink)'}}>Discord Connected</div>
                          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink3)',marginTop:1}}>Reply alerts + cron summaries active</div>
                        </div>
                      </div>
                      <button className="btn btn-ghost btn-xs" onClick={()=>fetch('/api/notify').then(r=>r.json()).then(d=>toast(d.ok?'Test sent ✓':'Failed',d.ok?'o':'e'))}>Send test</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* System Log */}
            <div className="card">
              <div className="card-hd" style={{marginBottom:12}}><div className="ct">System Log</div></div>
              <Logbox maxH="180px"/>
            </div>
          </>}

          {/* ══ SCRAPE ══ */}
          {tab==='scrape'&&<>
            <div className="ph">
              <div className="ph-t">Lead Discovery</div>
              <div className="ph-s">Multi-source lead gen · GitHub · YC · HN · LinkedIn · discover crypto traders, KOLs, DeFi builders → enrich → generate → send</div>
            </div>

            {/* SOURCE SELECTOR */}
            <div className="card" style={{padding:'16px 20px',marginBottom:12}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}}>
                <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'1px',flexShrink:0}}>Source</span>
                <div style={{display:'flex',gap:6,flex:1,flexWrap:'wrap'}}>
                  {([
                    {id:'github',      label:'GitHub',        icon:'⚡', desc:'Crypto/trading orgs via search · stars · open source signal'},
                    {id:'yc',          label:'YC + Show HN',  icon:'🚀', desc:'YC-backed crypto/DeFi startups + HN launches'},
                    {id:'hackernews',  label:'Hacker News',   icon:'🗞',  desc:"Who's Hiring threads · AI teams recruiting"},
                    {id:'linkedin',    label:'LinkedIn',       icon:'💼', desc:'Crypto/trading company search via Proxycurl'},
                  ] as {id:'github'|'yc'|'hackernews'|'linkedin',label:string,icon:string,desc:string}[]).map(s=>(
                    <button key={s.id}
                      onClick={()=>{setScrapeSource(s.id);setDiscovered([]);setScrSt({});setScraped({})}}
                      style={{
                        display:'flex',flexDirection:'column',alignItems:'flex-start',
                        padding:'10px 14px',borderRadius:'var(--r)',
                        border:`1.5px solid ${scrapeSource===s.id?'var(--red2)':'var(--b)'}`,
                        background:scrapeSource===s.id?'#4ECDC408':'var(--s2)',
                        cursor:'pointer',transition:'all .12s',flex:1,minWidth:130,textAlign:'left',
                      }}>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                        <span style={{fontSize:13}}>{s.icon}</span>
                        <span style={{fontFamily:'var(--sans)',fontWeight:700,fontSize:12,
                          color:scrapeSource===s.id?'var(--red2)':'var(--ink)'}}>{s.label}</span>
                        {scrapeSource===s.id&&<span style={{fontFamily:'var(--mono)',fontSize:8,
                          color:'var(--red2)',marginLeft:'auto'}}>ACTIVE</span>}
                      </div>
                      <div style={{fontFamily:'var(--body)',fontSize:10,color:'var(--ink4)',lineHeight:1.4}}>{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {scrapeSource==='linkedin'&&(
                <div style={{marginBottom:12,padding:'10px 14px',background:'#d9770610',borderRadius:'var(--r)',
                  border:'1px solid #d9770630',fontFamily:'var(--mono)',fontSize:11,color:'var(--yellow)'}}>
                  ⚠ Requires <code style={{background:'var(--s3)',padding:'1px 5px',borderRadius:3}}>PROXYCURL_API_KEY</code> in Vercel env vars ·{' '}
                  <a href="https://nubela.co/proxycurl" target="_blank" rel="noopener noreferrer"
                    style={{color:'var(--yellow)'}}>nubela.co/proxycurl</a> — 10 free credits on signup
                </div>
              )}

              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
                <span style={{fontFamily:'var(--body)',fontSize:11,color:'var(--ink3)'}}>
                  {scrapeSource==='github'&&'15 rotating queries · deduped against CRM · 5,000 req/hr'}
                  {scrapeSource==='yc'&&'YC Companies API · recent batches (W25/S24/W23) · Show HN launches'}
                  {scrapeSource==='hackernews'&&"Parses latest Who's Hiring threads via HN Algolia API"}
                  {scrapeSource==='linkedin'&&'Searches LinkedIn companies via Proxycurl · $0.01/lookup'}
                </span>
                <div className="btn-row">
                  <button className="btn btn-dark" onClick={discoverOrgs} disabled={discovering}>
                    {discovering?'Searching...':`🔍 Discover from ${
                      scrapeSource==='github'?'GitHub':
                      scrapeSource==='yc'?'YC + Show HN':
                      scrapeSource==='hackernews'?'Hacker News':'LinkedIn'
                    }`}
                  </button>
                  <button className="btn btn-dark" onClick={scrapeAll}
                    disabled={Object.values(scrSt).some(s=>s==='running')||!discovered.length}>
                    Enrich All
                  </button>
                  <button className="btn btn-red" onClick={saveToAirtable} disabled={!scCnt}>↑ Save {scCnt} to CRM</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>loadLeads()}>↻ Reload</button>
                </div>
              </div>
            </div>

            {/* TOPIC / NICHE FILTER PANEL */}
            {(()=>{
              const TOPIC_DEFS = [
                // Crypto Trading
                {id:'crypto-traders', label:'Crypto Traders',    emoji:'📊', cat:'Crypto Trading',     desc:'Active traders, TA analysts, signal providers'},
                {id:'algo-trading',   label:'Algo & Quant',      emoji:'🤖', cat:'Crypto Trading',     desc:'Algorithmic trading, quant strategies, bots'},
                {id:'trading-tools',  label:'Trading Tools',     emoji:'🔧', cat:'Crypto Trading',     desc:'Charting, analytics, portfolio trackers'},
                {id:'ai-trading',     label:'AI Trading',        emoji:'🧠', cat:'Crypto Trading',     desc:'AI/ML signals, prediction, sentiment'},
                // DeFi & Web3
                {id:'defi-protocols', label:'DeFi Protocols',    emoji:'⛓️', cat:'DeFi & Web3',        desc:'DEXs, lending, yield, staking'},
                {id:'web3-wallets',   label:'Wallets & Infra',   emoji:'💼', cat:'DeFi & Web3',        desc:'Wallet SDKs, bridges, chain infra'},
                {id:'onchain-analytics',label:'On-Chain Analytics',emoji:'📈',cat:'DeFi & Web3',       desc:'Blockchain data, whale tracking'},
                {id:'nft-gaming',     label:'NFT & Gaming',      emoji:'🎮', cat:'DeFi & Web3',        desc:'NFT platforms, GameFi, play-to-earn'},
                // Forex & TradFi
                {id:'forex-trading',  label:'Forex Trading',     emoji:'💱', cat:'Forex & TradFi',     desc:'Forex brokers, prop firms, signals'},
                {id:'prop-firms',     label:'Prop Firms',        emoji:'🏦', cat:'Forex & TradFi',     desc:'Proprietary trading, funded programs'},
                {id:'fintech-payments',label:'Payments & Fintech',emoji:'💳',cat:'Forex & TradFi',     desc:'Crypto payments, neobanks, gateways'},
                // KOL & Influencer
                {id:'crypto-kols',    label:'Crypto KOLs',       emoji:'🎤', cat:'KOL & Influencer',   desc:'Crypto influencers, CT personalities'},
                {id:'trading-communities',label:'Trading Communities',emoji:'👥',cat:'KOL & Influencer',desc:'Discord/TG trading groups, signals'},
                {id:'content-creators',label:'Finance Creators', emoji:'📹', cat:'KOL & Influencer',   desc:'Finance YouTubers, TikTokers, podcasts'},
                // Network Marketing
                {id:'mlm-networks',   label:'MLM Networks',      emoji:'🕸️', cat:'Network Marketing',  desc:'Network marketing, referral systems'},
                {id:'affiliate-marketing',label:'Affiliate Marketing',emoji:'🔗',cat:'Network Marketing',desc:'Affiliate platforms, commission tracking'},
                // Blockchain
                {id:'smart-contracts',label:'Smart Contracts',   emoji:'📝', cat:'Blockchain',          desc:'Solidity devs, auditors, EVM tooling'},
                {id:'l2-scaling',     label:'L2 & Scaling',      emoji:'🚀', cat:'Blockchain',          desc:'L2 rollups, sidechains, bridges'},
                {id:'dao-governance', label:'DAO & Governance',  emoji:'🏛️', cat:'Blockchain',          desc:'DAO tooling, governance, treasury'},
              ]
                            const cats = Array.from(new Set(TOPIC_DEFS.map((t:any)=>t.cat)))
              const toggleTopic = (id:string) => {
                setActiveTopics(prev=>{
                  const next=new Set(prev)
                  next.has(id)?next.delete(id):next.add(id)
                  return next
                })
              }
              const selectAll   = () => setActiveTopics(new Set(TOPIC_DEFS.map((t:any)=>t.id)))
              const clearAll    = () => setActiveTopics(new Set())
              return(
                <div className="card" style={{padding:'14px 20px',marginBottom:12}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'1px'}}>Topics & Niches</span>
                      <span style={{fontFamily:'var(--mono)',fontSize:10,padding:'2px 8px',borderRadius:10,
                        background:activeTopics.size>0?'var(--red2)':'var(--b2)',color:activeTopics.size>0?'#fff':'var(--ink4)',fontWeight:600}}>
                        {activeTopics.size===0?'All':''+activeTopics.size} selected
                      </span>
                      <span style={{fontFamily:'var(--body)',fontSize:11,color:'var(--ink4)'}}>
                        {activeTopics.size===0?'Discovering across all topics':
                         `Focused on ${activeTopics.size} topic${activeTopics.size===1?'':'s'} — drives what gets discovered`}
                      </span>
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      <button className="btn btn-ghost btn-xs" onClick={()=>setShowTopicPanel(p=>!p)}>
                        {showTopicPanel?'▲ Collapse':'▼ Expand topics'}
                      </button>
                      {activeTopics.size>0&&<button className="btn btn-ghost btn-xs" onClick={clearAll}>✕ Clear all</button>}
                      {activeTopics.size<TOPIC_DEFS.length&&<button className="btn btn-ghost btn-xs" onClick={selectAll}>Select all</button>}
                    </div>
                  </div>

                  {/* Selected topic chips — always visible */}
                  {activeTopics.size>0&&!showTopicPanel&&(
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      {TOPIC_DEFS.filter(t=>activeTopics.has(t.id)).map(t=>(
                        <span key={t.id}
                          onClick={()=>toggleTopic(t.id)}
                          style={{display:'flex',alignItems:'center',gap:4,fontFamily:'var(--mono)',fontSize:10,
                            padding:'3px 10px',borderRadius:20,cursor:'pointer',
                            background:'var(--red2)',color:'#fff',fontWeight:600}}>
                          {t.emoji} {t.label} <span style={{opacity:.7,marginLeft:2}}>✕</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Full topic grid — expanded */}
                  {showTopicPanel&&(
                    <div>
                      {cats.map(cat=>(
                        <div key={cat} style={{marginBottom:14}}>
                          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',textTransform:'uppercase',
                            letterSpacing:'1px',marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
                            {cat}
                          </div>
                          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                            {TOPIC_DEFS.filter(t=>t.cat===cat).map(t=>{
                              const active=activeTopics.has(t.id)
                              return(
                                <button key={t.id} onClick={()=>toggleTopic(t.id)}
                                  title={t.desc}
                                  style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',
                                    borderRadius:20,border:`1.5px solid ${active?'var(--red2)':'var(--b)'}`,
                                    background:active?'var(--red2)':'var(--s2)',
                                    color:active?'#fff':'var(--ink)',
                                    fontFamily:'var(--mono)',fontSize:10,fontWeight:active?700:400,
                                    cursor:'pointer',transition:'all .12s',whiteSpace:'nowrap'}}>
                                  <span>{t.emoji}</span>
                                  <span>{t.label}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                      <div style={{marginTop:8,padding:'8px 12px',background:'var(--s2)',borderRadius:'var(--r)',
                        fontFamily:'var(--body)',fontSize:11,color:'var(--ink3)'}}>
                        💡 Topics control which GitHub queries run, which YC company tags are searched,
                        which HN keywords match, and which LinkedIn searches fire.
                        Select none to search everything.
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* SOURCE-AWARE FILTER BAR */}
            <div className="card" style={{padding:'12px 16px',marginBottom:12,background:'var(--s2)'}}>
              <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'1px',flexShrink:0}}>Sort & Filter</span>

                {/* Sort — always shown */}
                <select value={filterSortBy} onChange={e=>setFilterSortBy(e.target.value as any)}
                  style={{fontFamily:'var(--mono)',fontSize:11,padding:'5px 10px',borderRadius:'var(--r)',border:'1px solid var(--b2)',background:'var(--s1)',color:'var(--ink)',cursor:'pointer'}}>
                  <option value="score">↓ Lead Score</option>
                  {scrapeSource==='github'&&<option value="stars">↓ Stars</option>}
                  {scrapeSource==='github'&&<option value="forks">↓ Forks</option>}
                  {scrapeSource==='github'&&<option value="members">↓ Members</option>}
                </select>

                {/* GitHub-specific filters */}
                {scrapeSource==='github'&&<>
                  <div style={{display:'flex',alignItems:'center',gap:5}}>
                    <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)'}}>Min ⭐</span>
                    <input type="number" min={0} value={filterMinStars} onChange={e=>setFilterMinStars(Number(e.target.value))}
                      style={{width:64,fontFamily:'var(--mono)',fontSize:11,padding:'5px 8px',borderRadius:'var(--r)',border:'1px solid var(--b2)',background:'var(--s1)',color:'var(--ink)'}}/>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:5}}>
                    <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)'}}>Min members</span>
                    <input type="number" min={0} value={filterMinMembers} onChange={e=>setFilterMinMembers(Number(e.target.value))}
                      style={{width:56,fontFamily:'var(--mono)',fontSize:11,padding:'5px 8px',borderRadius:'var(--r)',border:'1px solid var(--b2)',background:'var(--s1)',color:'var(--ink)'}}/>
                  </div>
                </>}

                {/* Min score — all sources */}
                <div style={{display:'flex',alignItems:'center',gap:5}}>
                  <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)'}}>Min score</span>
                  <input type="number" min={0} max={100} value={filterMinScore} onChange={e=>setFilterMinScore(Number(e.target.value))}
                    style={{width:52,fontFamily:'var(--mono)',fontSize:11,padding:'5px 8px',borderRadius:'var(--r)',border:'1px solid var(--b2)',background:'var(--s1)',color:'var(--ink)'}}/>
                </div>

                {/* Has email toggle */}
                <label style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)',userSelect:'none'}}>
                  <input type="checkbox" checked={filterShowHasEmail} onChange={e=>setFilterShowHasEmail(e.target.checked)}
                    style={{accentColor:'var(--red2)',width:13,height:13}}/>
                  Email found
                </label>

                {/* Reset */}
                {(filterMinStars>0||filterMinForks>0||filterMinMembers>0||filterMinScore>0||filterShowHasEmail||filterSortBy!=='score')&&(
                  <button className="btn btn-ghost btn-xs" style={{marginLeft:'auto'}} onClick={()=>{
                    setFilterMinStars(0);setFilterMinForks(0);setFilterMinMembers(0);
                    setFilterMinScore(0);setFilterShowHasEmail(false);setFilterSortBy('score');
                  }}>✕ Reset filters</button>
                )}
              </div>
            </div>

            {/* DISCOVER MODE */}
            {(()=>{
              const sortFn=(a:any,b:any)=>{
                if(filterSortBy==='stars')   return (b.stars||0)-(a.stars||0)
                if(filterSortBy==='forks')   return (scraped[b.org]?.githubForks||0)-(scraped[a.org]?.githubForks||0)
                if(filterSortBy==='members') return (scraped[b.org]?.orgMembers||0)-(scraped[a.org]?.orgMembers||0)
                if(filterSortBy==='watchers')return (scraped[b.org]?.githubWatchers||0)-(scraped[a.org]?.githubWatchers||0)
                // default: score — use scraped data if available, else stars as proxy
                const scoreA = scraped[a.org]?.leadScore ?? a.stars ?? 0
                const scoreB = scraped[b.org]?.leadScore ?? b.stars ?? 0
                return scoreB-scoreA
              }
              const filtered = discovered
                .filter(o=>{
                  const enriched = scraped[o.org]
                  // For unenriched orgs, only apply star filter (the only pre-enrichment signal)
                  // Skip member/fork/score filters until enriched — don't hide cards user hasn't seen yet
                  if(filterMinStars>0&&(o.stars||0)<filterMinStars) return false
                  if(!enriched) return true  // show unenriched orgs unless star filter blocks them
                  if(filterMinForks>0&&(enriched.githubForks||0)<filterMinForks) return false
                  if(filterMinMembers>0&&(enriched.orgMembers||0)<filterMinMembers) return false
                  if(filterMinScore>0&&(enriched.leadScore||0)<filterMinScore) return false
                  if(filterShowHasEmail&&!enriched.contactEmail) return false
                  return true
                })
                .sort(sortFn)
              return(
                <div className="card">
                  <div className="card-hd">
                    <div className="ct">
                      {scrapeSource==='github'?'GitHub Orgs':scrapeSource==='yc'?'YC Companies + Show HN':scrapeSource==='hackernews'?'HN Hiring Posts':'LinkedIn Companies'}
                      {discovered.length>0&&<span style={{color:'var(--green)',fontSize:11,fontWeight:400,marginLeft:8}}>
                        {filtered.length} of {discovered.length}
                      </span>}
                    </div>
                  </div>
                  {discovering&&(
                    <div style={{padding:'40px 0',textAlign:'center',color:'var(--ink3)',fontFamily:'var(--mono)',fontSize:12}}>
                      <div style={{marginBottom:12}}>
                        {scrapeSource==='github'&&'Searching GitHub across up to 15 queries...'}
                        {scrapeSource==='yc'&&'Searching YC Companies + Show HN...'}
                        {scrapeSource==='hackernews'&&"Scanning Hacker News Who's Hiring threads..."}
                        {scrapeSource==='linkedin'&&'Searching LinkedIn via Proxycurl...'}
                      </div>
                    </div>
                  )}
                  {!discovering&&discovered.length===0&&(
                    <div className="empty">
                      <div className="empty-ico">
                        {scrapeSource==='github'?'⚡':scrapeSource==='yc'?'🚀':scrapeSource==='hackernews'?'🗞':'💼'}
                      </div>
                      <div className="empty-t">
                        {scrapeSource==='github'&&'Click Discover to find AI orgs on GitHub'}
                        {scrapeSource==='yc'&&'YC-backed startups · recent batches W25/S24/W23 · Show HN launches'}
                        {scrapeSource==='hackernews'&&"Click Discover to scan HN Who's Hiring threads"}
                        {scrapeSource==='linkedin'&&'Click Discover to search LinkedIn companies via Proxycurl'}
                      </div>
                      <div className="empty-s">
                        {scrapeSource==='github'&&'15 rotating search queries · deduped vs your CRM · enriches org members + emails'}
                        {scrapeSource==='yc'&&'YC Companies API + HN Algolia · no auth needed · perfectly targeted ICP'}
                        {scrapeSource==='hackernews'&&'Parses latest hiring posts · extracts company + website · filters for AI signal'}
                        {scrapeSource==='linkedin'&&'Requires PROXYCURL_API_KEY · 10 free credits on signup · $0.01/lookup'}
                      </div>
                    </div>
                  )}
                  {filtered.length>0&&(
                    <div className="sg">
                      {filtered.map((org:any)=>{
                        const st=scrSt[org.org]||'idle', d=scraped[org.org]
                        const score=d?.leadScore||org.score||0
                        const srcIcon=org.source==='yc'?'🏆':org.source==='showhn'?'🗞':org.source==='hackernews'?'🗞':org.source==='linkedin'?'💼':'⚡'
                        return(
                          <div key={org.org}
                            className={`scard ${st==='done'?'done':st==='running'?'running':st==='fail'?'fail':''}`}
                            onClick={()=>(st==='idle'||st==='fail')&&scrapeOne({org:org.org,name:org.name,type:org.type,website:org.website||org.url,source:org.source||scrapeSource})}>
                            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:4}}>
                              <div className="sn" style={{flex:1}}>{org.name}</div>
                              <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',flexShrink:0}}>{srcIcon}</span>
                            </div>
                            <div className="stype">{org.tagline||org.type}</div>
                            {/* Source-specific signals */}
                            {org.source==='github'&&<div className="sstar">⭐ {(org.stars||0).toLocaleString()}</div>}
                            {org.source==='yc'&&org.batch&&<div className="sstar" style={{color:'#f97316'}}>YC {org.batch}{org.teamSize>0?` · ${org.teamSize} team`:''}</div>}
                            {org.source==='showhn'&&<div className="sstar" style={{color:'var(--yellow)'}}>🗞 Show HN</div>}
                            {org.source==='hackernews'&&<div className="sstar" style={{color:'var(--yellow)'}}>🗞 HN Hiring</div>}
                            {org.source==='linkedin'&&org.followers>0&&<div className="sstar">👥 {org.followers.toLocaleString()} followers</div>}
                            {/* Score badge */}
                            {score>0&&!d&&(
                              <div style={{marginTop:4}}>
                                <span style={{fontFamily:'var(--mono)',fontSize:9,padding:'1px 5px',borderRadius:3,
                                  background:score>=70?'#16a34a15':score>=40?'#d9770615':'var(--s3)',
                                  color:score>=70?'var(--green)':score>=40?'var(--yellow)':'var(--ink3)'}}>
                                  score {score}
                                </span>
                              </div>
                            )}
                            {/* Enriched data */}
                            {d?<>
                              <div style={{display:'flex',gap:8,marginTop:4,flexWrap:'wrap'}}>
                                {d.githubForks>0&&<span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink3)'}}>⑂{d.githubForks}</span>}
                                {d.orgMembers>0&&<span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink3)'}}>👥{d.orgMembers}</span>}
                                {d.leadScore>0&&<span style={{fontFamily:'var(--mono)',fontSize:9,padding:'1px 5px',borderRadius:3,
                                  background:d.leadScore>=70?'#16a34a15':d.leadScore>=40?'#d9770615':'var(--s3)',
                                  color:d.leadScore>=70?'var(--green)':d.leadScore>=40?'var(--yellow)':'var(--ink3)'}}>
                                  {d.leadScore}
                                </span>}
                              </div>
                              {d.contactEmail
                                ?<div className="sst" style={{color:'var(--green)'}}>✓ {d.contactEmail}</div>
                                :<div className="sst" style={{color:'var(--ink4)'}}>no email found</div>}
                            </>:<div className="sst" style={{color:st==='running'?'var(--yellow)':st==='fail'?'var(--red)':'var(--ink4)'}}>
                              {st==='running'?'Enriching...':st==='fail'?'Failed — retry':'Click to enrich'}
                            </div>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}


            <div className="card">
              <div className="ct" style={{marginBottom:14}}>Log</div>
              <Logbox/>
            </div>
          </>}

          {/* ══ CRM ══ */}
          {tab==='crm'&&<>
            <div className="ph">
              <div className="ph-t">Lead CRM</div>
              <div className="ph-s">{stats.total} leads · {stats.hasContact} contacts · {stats.sent} sent · {stats.replied} replied</div>
            </div>

            {/* SEARCH + FILTER BAR */}
            <div className="card" style={{padding:'12px 16px',marginBottom:12}}>
              <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                <div style={{flex:1,minWidth:180,position:'relative'}}>
                  <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--ink4)',fontSize:13,pointerEvents:'none'}}>🔍</span>
                  <input type="text" value={crmSearch} onChange={e=>setCrmSearch(e.target.value)}
                    placeholder="Search company, email, notes..."
                    style={{width:'100%',padding:'7px 10px 7px 32px',fontFamily:'var(--body)',fontSize:12,borderRadius:'var(--r)',border:'1px solid var(--b2)',background:'var(--s2)',color:'var(--ink)',outline:'none',boxSizing:'border-box'}}/>
                </div>
                <select value={crmFilter} onChange={e=>setCrmFilter(e.target.value)}
                  style={{fontFamily:'var(--mono)',fontSize:11,padding:'7px 12px',borderRadius:'var(--r)',border:'1px solid var(--b2)',background:'var(--s2)',color:'var(--ink)',cursor:'pointer'}}>
                  <option value="all">All leads</option>
                  <option value="new">New (unsent)</option>
                  <option value="sent">Email sent</option>
                  <option value="replied">Replied</option>
                  <option value="interested">Interested</option>
                  <option value="noemail">No email</option>
                  <option value="noseq">No sequence</option>
                  <option value="bounced">Bounced</option>
                  <option value="disqualified">Disqualified</option>
                </select>
                {(crmSearch||crmFilter!=='all')&&(
                  <button className="btn btn-ghost btn-xs" onClick={()=>{setCrmSearch('');setCrmFilter('all')}}>✕ Reset</button>
                )}
                <div className="btn-row" style={{marginLeft:'auto'}}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>loadLeads()}>↻</button>
                  {sel.size>0&&<button className="btn btn-ghost btn-sm" onClick={()=>setSel(new Set())}>Clear {sel.size}</button>}
                  <button className="btn btn-ghost btn-sm" onClick={()=>window.open('https://airtable.com/appCYgmFc8vTfwyv1','_blank')}>↗ Airtable</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>{
                    const f=crmFilter!=='all'?`?filter=${crmFilter}`:''
                    window.open(`/api/export${f}`,'_blank')
                  }} title="Download current filtered view as CSV">↓ CSV</button>
                </div>
              </div>
            </div>

            {/* MAIN GRID: table + side panel */}
            {(()=>{
              const filtered=leads.filter(l=>{
                const q=crmSearch.toLowerCase()
                const matchQ=!q||(l.company.toLowerCase().includes(q)||l.contactEmail.toLowerCase().includes(q)||l.notes.toLowerCase().includes(q)||l.contactName.toLowerCase().includes(q))
                const matchF=crmFilter==='all'
                  ||(crmFilter==='new'&&l.status==='New')
                  ||(crmFilter==='sent'&&l.status==='Email Sent')
                  ||(crmFilter==='replied'&&l.status==='Replied')
                  ||(crmFilter==='interested'&&l.replyIntent==='interested')
                  ||(crmFilter==='noemail'&&!l.contactEmail)
                  ||(crmFilter==='noseq'&&!l.emailBody)||(crmFilter==='bounced'&&l.bounced)||(crmFilter==='disqualified'&&l.disqualified)
                return matchQ&&matchF
              })
              return(
                <div style={{display:'grid',gridTemplateColumns:detailLead?'1fr 360px':'1fr',gap:12,alignItems:'start'}}>

                  {/* LEFT — TABLE */}
                  <div className="card" style={{overflow:'hidden'}}>
                    {leads.length===0?(
                      <div className="empty">
                        <div className="empty-ico">◈</div>
                        <div className="empty-t">No leads yet</div>
                        <div className="empty-s">Scrape GitHub orgs and save to Airtable.</div>
                        <button className="btn btn-dark" onClick={()=>setTab('scrape')}>Go to Scraper</button>
                      </div>
                    ):(
                      <>
                        {/* Sticky header */}
                        <table style={{width:'100%',borderCollapse:'collapse',tableLayout:'fixed'}}>
                          <colgroup>
                            <col style={{width:32}}/><col style={{width:'21%'}}/><col style={{width:58}}/><col style={{width:'21%'}}/><col style={{width:100}}/><col style={{width:120}}/><col style={{width:72}}/><col style={{width:56}}/><col style={{width:72}}/>
                          </colgroup>
                          <thead><tr>
                            <th style={{padding:'9px 12px'}}><input type="checkbox" className="ck" onChange={e=>setSel(e.target.checked?new Set(filtered.map(l=>l.id)):new Set())}/></th>
                            <th>Company</th><th>Score</th><th>Contact Email</th><th>Status</th><th>Sequence</th><th>Stars</th><th>Email</th><th></th>
                          </tr></thead>
                        </table>
                        {/* Scrollable body */}
                        <div style={{maxHeight:520,overflowY:'auto'}}>
                          <table style={{width:'100%',borderCollapse:'collapse',tableLayout:'fixed'}}>
                            <colgroup>
                              <col style={{width:32}}/><col style={{width:'21%'}}/><col style={{width:58}}/><col style={{width:'21%'}}/><col style={{width:100}}/><col style={{width:120}}/><col style={{width:72}}/><col style={{width:56}}/><col style={{width:72}}/>
                            </colgroup>
                            <tbody>
                              {filtered.map(lead=>(
                                <tr key={lead.id}
                                  className={sel.has(lead.id)?'sel':''}
                                  onClick={()=>setDetailLead(detailLead?.id===lead.id?null:lead)}
                                  style={{cursor:'pointer',background:detailLead?.id===lead.id?'#4ECDC408':''}}>
                                  <td style={{padding:'9px 12px'}} onClick={e=>e.stopPropagation()}>
                                    <input type="checkbox" className="ck" checked={sel.has(lead.id)} onChange={e=>{const s=new Set(sel);e.target.checked?s.add(lead.id):s.delete(lead.id);setSel(s)}}/>
                                  </td>
                                  <td style={{padding:'9px 12px'}}><strong style={{fontSize:12}}>{lead.company}</strong></td>
                                  <td style={{padding:'9px 12px'}}>
                                    {lead.leadScore>0
                                      ?<span style={{fontFamily:'var(--mono)',fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,background:lead.leadScore>=70?'#16a34a15':lead.leadScore>=40?'#d9770615':'var(--s3)',color:lead.leadScore>=70?'var(--green)':lead.leadScore>=40?'var(--yellow)':'var(--ink3)'}}>{lead.leadScore}</span>
                                      :<span style={{color:'var(--ink4)',fontSize:11}}>—</span>}
                                  </td>
                                  <td style={{padding:'9px 12px'}}>
                                    {lead.contactEmail?(
                                      <div style={{display:'flex',alignItems:'center',gap:4}}>
                                        <span style={{fontFamily:'var(--mono)',fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.contactEmail}</span>
                                        {lead.jobTitle?.includes('(verified)')&&<span style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--green)',background:'#16a34a10',padding:'1px 4px',borderRadius:3,flexShrink:0}}>✓</span>}
                                        {lead.jobTitle?.includes('(inferred)')&&<span style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--yellow)',background:'#d9770610',padding:'1px 4px',borderRadius:3,flexShrink:0}}>~</span>}
                                      </div>
                                    ):<span style={{color:'var(--ink4)',fontStyle:'italic',fontSize:11}}>—</span>}
                                  </td>
                                  <td style={{padding:'9px 12px'}}>
                                    <span className={`pill ${lead.status==='Email Sent'?'ps':lead.status==='Replied'?'pr':lead.status==='Booked Call'?'pb2':'pn'}`}>{lead.status||'New'}</span>
                                  </td>
                                  <td style={{padding:'9px 12px'}}>
                                    <span style={{fontFamily:'var(--mono)',fontSize:10,color:lead.sequenceStatus==='Replied'||lead.sequenceStatus==='Booked'?'var(--green)':lead.sequenceStatus==='Cold'||!lead.sequenceStatus?'var(--ink4)':'var(--ink3)'}}>
                                      {lead.sequenceStatus||'—'}
                                    </span>
                                  </td>
                                  <td style={{padding:'9px 12px'}}>
                                    <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)'}}>{lead.githubStars>0?`⭐${lead.githubStars.toLocaleString()}`:'—'}</span>
                                  </td>
                                  <td style={{padding:'9px 12px'}}>
                                    {lead.emailBody?<span style={{color:'var(--green)',fontFamily:'var(--mono)',fontSize:10}}>✓{lead.followUp1Body?' +seq':''}</span>:<span style={{color:'var(--ink4)',fontSize:10}}>—</span>}
                                  </td>
                                  <td style={{padding:'9px 12px'}}>
                                    {lead.emailBody&&<button className="btn btn-ghost btn-xs" onClick={e=>{e.stopPropagation();setPreview(lead)}}>↗</button>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {filtered.length>0&&(
                          <div style={{padding:'8px 14px',background:'var(--s2)',borderTop:'1px solid var(--b)',display:'flex',justifyContent:'space-between',fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)'}}>
                            <span>{filtered.length} leads{filtered.length!==leads.length?` (filtered from ${leads.length})`:''}</span>
                            {detailLead?<span>← click row to close panel</span>:<span>click row to inspect →</span>}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* RIGHT — DETAIL PANEL */}
                  {detailLead&&(
                    <div style={{background:'var(--s1)',border:'1px solid var(--b)',borderRadius:'var(--r2)',overflow:'hidden',boxShadow:'var(--sh)',position:'sticky',top:72,maxHeight:'calc(100vh - 90px)',overflowY:'auto'}}>
                      {/* Header */}
                      <div style={{padding:'16px 18px',borderBottom:'1px solid var(--b)',display:'flex',alignItems:'flex-start',justifyContent:'space-between',background:'var(--s1)',position:'sticky',top:0,zIndex:2}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontFamily:'var(--sans)',fontWeight:800,fontSize:15,letterSpacing:'-.3px',marginBottom:5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{detailLead.company}</div>
                          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                            {detailLead.leadScore>0&&<span style={{fontFamily:'var(--mono)',fontSize:9,padding:'2px 7px',borderRadius:10,background:detailLead.leadScore>=70?'#16a34a18':'#d9770618',color:detailLead.leadScore>=70?'var(--green)':'var(--yellow)',fontWeight:700}}>Score {detailLead.leadScore}</span>}
                            <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)'}}>{detailLead.companyType}</span>
                            {detailLead.sequenceStatus&&detailLead.sequenceStatus!=='Cold'&&<span style={{fontFamily:'var(--mono)',fontSize:9,color:detailLead.sequenceStatus==='Replied'?'var(--green)':'var(--ink3)'}}>{detailLead.sequenceStatus}</span>}
                          </div>
                        </div>
                        <button className="btn btn-ghost btn-xs" style={{flexShrink:0,marginLeft:8}} onClick={()=>setDetailLead(null)}>✕</button>
                      </div>

                      {/* Contact */}
                      <div style={{padding:'14px 18px',borderBottom:'1px solid var(--b)'}}>
                        <div style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:8}}>Contact</div>
                        {detailLead.contactName&&<div style={{fontSize:13,fontWeight:700,marginBottom:3}}>{detailLead.contactName}</div>}
                        {detailLead.jobTitle&&<div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)',marginBottom:5}}>{detailLead.jobTitle.replace(' (verified)','').replace(' (inferred)','')}</div>}
                        {detailLead.contactEmail
                          ?<div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--green)',marginBottom:4}}>✓ {detailLead.contactEmail}</div>
                          :<div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--ink4)',fontStyle:'italic',marginBottom:4}}>No email found</div>}
                        {detailLead.openCount>0&&(
                          <div style={{marginTop:6,display:'flex',alignItems:'center',gap:6}}>
                            <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--green)'}}>👁 Opened {detailLead.openCount}×</span>
                            {detailLead.lastOpened&&<span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)'}}>{detailLead.lastOpened}</span>}
                          </div>
                        )}
                        {detailLead.bounced&&(
                          <div style={{marginTop:6,padding:'8px 10px',background:'#4ECDC410',borderRadius:'var(--r)',border:'1px solid #4ECDC430'}}>
                            <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--red)',fontWeight:600,marginBottom:2}}>⚡ Email bounced</div>
                            {detailLead.bounceReason&&<div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink3)',marginTop:2}}>{detailLead.bounceReason.slice(0,120)}</div>}
                          </div>
                        )}
                        {detailLead.website&&<a href={detailLead.website.startsWith('http')?detailLead.website:`https://${detailLead.website}`} target="_blank" rel="noopener noreferrer" style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)',textDecoration:'none'}}>{detailLead.website.replace(/^https?:\/\//,'')}</a>}
                        {detailLead.githubOrgUrl&&<div style={{marginTop:4}}><a href={detailLead.githubOrgUrl} target="_blank" rel="noopener noreferrer" style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink4)',textDecoration:'none'}}>github.com/{detailLead.githubOrgUrl.split('/').pop()}</a></div>}
                      </div>

                      {/* GitHub metrics */}
                      {(detailLead.githubStars>0||detailLead.orgMembers>0)&&(
                        <div style={{padding:'14px 18px',borderBottom:'1px solid var(--b)'}}>
                          <div style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:8}}>GitHub</div>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                            {[
                              {l:'Stars',    v:detailLead.githubStars,     fmt:(n:number)=>n.toLocaleString()},
                              {l:'Forks',    v:detailLead.githubForks,     fmt:(n:number)=>n.toLocaleString()},
                              {l:'Members',  v:detailLead.orgMembers,      fmt:(n:number)=>n.toLocaleString()},
                              {l:'Contrib',  v:detailLead.contributors,    fmt:(n:number)=>n.toLocaleString()},
                              {l:'Watchers', v:detailLead.githubWatchers,  fmt:(n:number)=>n.toLocaleString()},
                              {l:'Repos',    v:detailLead.repoCount,       fmt:(n:number)=>n.toLocaleString()},
                            ].filter(m=>m.v>0).map(m=>(
                              <div key={m.l} style={{background:'var(--s2)',borderRadius:'var(--r)',padding:'7px 10px'}}>
                                <div style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--ink4)',marginBottom:1}}>{m.l}</div>
                                <div style={{fontFamily:'var(--mono)',fontSize:12,fontWeight:700}}>{m.fmt(m.v)}</div>
                              </div>
                            ))}
                          </div>
                          {detailLead.topRepos&&<div style={{marginTop:8,fontFamily:'var(--mono)',fontSize:9,color:'var(--ink3)',lineHeight:1.5}}>{detailLead.topRepos}</div>}
                        </div>
                      )}

                      {/* Email sequence */}
                      {(detailLead.emailBody||detailLead.followUp1Body)&&(
                        <div style={{padding:'14px 18px',borderBottom:'1px solid var(--b)'}}>
                          <div style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:10}}>Sequence</div>
                          {[
                            {tag:'Day 1',subj:detailLead.emailSubject,body:detailLead.emailBody,c:'#2563eb'},
                            {tag:'Day 5',subj:detailLead.followUp1Subject,body:detailLead.followUp1Body,c:'#d97706'},
                            {tag:'Day 12',subj:detailLead.followUp2Subject,body:detailLead.followUp2Body,c:'#4ECDC4'},
                          ].filter(e=>e.body).map(e=>(
                            <div key={e.tag} style={{marginBottom:8,background:'var(--s2)',borderRadius:'var(--r)',padding:'9px 11px',borderLeft:`3px solid ${e.c}`}}>
                              <div style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--ink4)',marginBottom:3}}>{e.tag}</div>
                              <div style={{fontFamily:'var(--mono)',fontSize:10,fontWeight:600,marginBottom:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.subj}</div>
                              <div style={{fontSize:10,color:'var(--ink3)',lineHeight:1.5,maxHeight:54,overflow:'hidden'}}>{e.body?.slice(0,160)}{e.body&&e.body.length>160?'…':''}</div>
                            </div>
                          ))}
                          <button className="btn btn-ghost btn-xs" style={{width:'100%',marginTop:2}} onClick={()=>{setPreview(detailLead);setDetailLead(null)}}>View full sequence →</button>
                        </div>
                      )}

                      {/* Reply */}
                      {detailLead.replyText&&(
                        <div style={{padding:'14px 18px',borderBottom:'1px solid var(--b)'}}>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                            <span style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'1px'}}>Their Reply</span>
                            {detailLead.replyIntent&&<span style={{fontFamily:'var(--mono)',fontSize:9,padding:'1px 7px',borderRadius:10,background:detailLead.replyIntent==='interested'?'#16a34a18':'var(--s3)',color:detailLead.replyIntent==='interested'?'var(--green)':'var(--ink3)'}}>{detailLead.replyIntent}</span>}
                          </div>
                          <div style={{fontSize:11,color:'var(--ink)',lineHeight:1.6,maxHeight:90,overflow:'hidden'}}>{detailLead.replyText.slice(0,280)}{detailLead.replyText.length>280?'…':''}</div>
                          {!detailLead.replySent&&<button className="btn btn-red btn-xs" style={{width:'100%',marginTop:8}} onClick={()=>{setTab('inbox');setInboxLead(detailLead)}}>Reply in Inbox →</button>}
                          {detailLead.replySent&&<div style={{marginTop:6,fontFamily:'var(--mono)',fontSize:9,color:'var(--green)',textAlign:'center'}}>✓ Reply sent</div>}
                        </div>
                      )}

                      {/* Notes */}
                      {detailLead.notes&&!detailLead.notes.startsWith('[REPLY')&&(
                        <div style={{padding:'14px 18px',borderBottom:'1px solid var(--b)'}}>
                          <div style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:6}}>Notes</div>
                          <div style={{fontSize:11,color:'var(--ink3)',lineHeight:1.5,maxHeight:80,overflow:'hidden'}}>{detailLead.notes.slice(0,240)}</div>
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{padding:'12px 18px',display:'flex',gap:8,flexWrap:'wrap'}}>
                        {!detailLead.disqualified?(
                          <button className="btn btn-ghost btn-sm" style={{flex:1,color:'var(--ink3)'}} onClick={async()=>{
                            await fetch('/api/airtable',{method:'POST',headers:{'Content-Type':'application/json'},
                              body:JSON.stringify({action:'update',recordId:detailLead.id,fields:{'Disqualified':true,'Status':'Not Interested','Sequence Status':'Opted Out'}})})
                            setLeads(p=>p.map(l=>l.id===detailLead.id?{...l,disqualified:true,status:'Not Interested',sequenceStatus:'Opted Out'}:l))
                            setDetailLead(null)
                            toast(`${detailLead.company} disqualified`,'w')
                          }}>✕ Disqualify</button>
                        ):(
                          <button className="btn btn-ghost btn-sm" style={{flex:1,color:'var(--green)'}} onClick={async()=>{
                            await fetch('/api/airtable',{method:'POST',headers:{'Content-Type':'application/json'},
                              body:JSON.stringify({action:'update',recordId:detailLead.id,fields:{'Disqualified':false,'Status':'New'}})})
                            setLeads(p=>p.map(l=>l.id===detailLead.id?{...l,disqualified:false,status:'New'}:l))
                            setDetailLead(d=>d?{...d,disqualified:false}:null)
                            toast(`${detailLead.company} re-qualified`,'o')
                          }}>↩ Re-qualify</button>
                        )}
                        <a href={`https://airtable.com/appCYgmFc8vTfwyv1/tblAsQXKEK9chUaT6/${detailLead.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{textDecoration:'none'}}>↗ Airtable</a>
                      </div>

                    </div>
                  )}
                </div>
              )
            })()}

          {preview&&(
              <div className="card">
                <div className="card-hd">
                  <div className="ct">{preview.company} — Full Sequence</div>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setPreview(null)}>✕ Close</button>
                </div>
                <div className="em">
                  <div>To: <span>{preview.contactEmail||'(no contact email — add in Airtable)'}</span></div>
                </div>
                {/* Email 1 */}
                <div style={{marginBottom:16}}>
                  <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
                    Cold Email · Day 1
                    <span style={{color:'var(--blue)',background:'#2563eb10',padding:'1px 6px',borderRadius:3}}>Send first</span>
                  </div>
                  <div className="em"><div>Subject: <span>{preview.emailSubject}</span></div></div>
                  <div className="ep">{preview.emailBody}</div>
                </div>
                {/* Follow-up 1 */}
                {preview.followUp1Body&&<div style={{marginBottom:16}}>
                  <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
                    Follow-up 1 · Day 5
                    <span style={{color:'var(--yellow)',background:'#d9770610',padding:'1px 6px',borderRadius:3}}>If no reply</span>
                  </div>
                  <div className="em"><div>Subject: <span>{preview.followUp1Subject}</span></div></div>
                  <div className="ep">{preview.followUp1Body}</div>
                </div>}
                {/* Follow-up 2 */}
                {preview.followUp2Body&&<div>
                  <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
                    Breakup Email · Day 12
                    <span style={{color:'var(--red)',background:'#4ECDC410',padding:'1px 6px',borderRadius:3}}>Final touchpoint</span>
                  </div>
                  <div className="em"><div>Subject: <span>{preview.followUp2Subject}</span></div></div>
                  <div className="ep">{preview.followUp2Body}</div>
                </div>}
              </div>
            )}
            <div className="alert ao">
              <span className="alert-icon">💡</span>
              <div className="alert-body">
                <div className="alert-title">Add contact emails to unlock campaign sending</div>
                Open Airtable → TradeCafe BD Leads → fill the Contact Email column. Target crypto KOLs, trading influencers, DeFi builders, and fund managers. Use <strong>Hunter.io</strong>, <strong>X/Twitter</strong>, or <strong>LinkedIn</strong>.
              </div>
            </div>
          </>}

          
          {/* ══ GENERATE ══ */}
          {tab==='generate'&&<>
            <div className="ph">
              <div className="ph-t">Email Generation</div>
              <div className="ph-s">Claude writes personalised cold emails per lead using their trading profile, crypto activity, and TradeCafe partner revenue share pitch — saved directly to Airtable</div>
            </div>
            <div className="card">
              <div className="card-hd">
                <div className="ct">Generate Emails</div>
                <div className="btn-row">
                  <button className="btn btn-dark" onClick={genEmails} disabled={genning||regenning||!leads.length||!health?.env?.anthropic}>
                    {genning?'Generating...':'✦ Generate'}
                  </button>
                  {stats.hasEmail>0&&(
                    <button className="btn btn-ghost btn-sm" onClick={regenAllEmails} disabled={genning||regenning}
                      title="Regenerate all existing emails with improved prompt (no dashes, call CTA)">
                      {regenning?`↻ ${regenProgress.done}/${regenProgress.total}...`:'↻ Regen All'}
                    </button>
                  )}
                  <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)'}}>{stats.hasEmail}/{stats.total} done</span>
                </div>
              </div>
              {!health?.env?.anthropic&&(
                <div className="alert ae mb16">
                  <span className="alert-icon">⚠</span>
                  <div className="alert-body">
                    <div className="alert-title">ANTHROPIC_API_KEY not configured</div>
                    Add it in Vercel → Settings → Environment Variables, then redeploy.
                  </div>
                </div>
              )}
              {regenning&&(
                <div className="pgwrap">
                  <div className="pglbl"><span>Regenerating with improved prompt...</span><span>{regenProgress.done}/{regenProgress.total}</span></div>
                  <div className="pgbar"><div className="pgfill" style={{width:`${Math.round((regenProgress.done/Math.max(regenProgress.total,1))*100)}%`}}/></div>
                </div>
              )}
              {genning&&(
                <div className="pgwrap">
                  <div className="pglbl"><span>Writing emails...</span><span>{genPct}%</span></div>
                  <div className="pgbar"><div className="pgfill" style={{width:`${genPct}%`}}/></div>
                </div>
              )}
              {leads.length===0?(
                <div className="empty">
                  <div className="empty-ico">✦</div>
                  <div className="empty-t">No leads loaded</div>
                  <div className="empty-s">Scrape GitHub orgs and save to Airtable first.</div>
                  <button className="btn btn-dark" onClick={()=>setTab('scrape')}>Go to Scraper</button>
                </div>
              ):<Logbox/>}
            </div>
            {leads.filter(l=>l.emailBody).length>0&&(
              <div className="card">
                <div className="card-hd">
                  <div className="ct">Generated Sequences</div>
                  <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)'}}>
                    {leads.filter(l=>l.emailBody).length} leads · 3 emails each
                  </span>
                </div>
                {leads.filter(l=>l.emailBody).slice(0,3).map((lead,i,arr)=>{
                  const hasFU1=!!lead.followUp1Body, hasFU2=!!lead.followUp2Body
                  return(
                    <div key={lead.id} style={{marginBottom:i<arr.length-1?24:0,paddingBottom:i<arr.length-1?24:0,borderBottom:i<arr.length-1?'1px solid var(--b)':'none'}}>
                      {/* Lead header with score */}
                      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                        <strong style={{fontSize:14}}>{lead.company}</strong>
                        <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)'}}>{lead.companyType}</span>
                        {lead.leadScore>0&&<span style={{fontFamily:'var(--mono)',fontSize:10,padding:'2px 7px',borderRadius:4,background:lead.leadScore>=70?'#16a34a15':lead.leadScore>=40?'#d9770615':'var(--s3)',color:lead.leadScore>=70?'var(--green)':lead.leadScore>=40?'var(--yellow)':'var(--ink3)'}}>Score {lead.leadScore}</span>}
                        {lead.contactEmail&&<span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--green)'}}>✓ {lead.contactEmail}</span>}
                      </div>
                      {/* 3-part sequence tabs */}
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                        {/* Cold email */}
                        <div style={{background:'var(--s2)',borderRadius:'var(--r)',padding:'12px',border:'1px solid var(--b)'}}>
                          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink3)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:8}}>Cold Email · Day 1</div>
                          <div style={{fontFamily:'var(--mono)',fontSize:11,fontWeight:600,color:'var(--ink)',marginBottom:8}}>{lead.emailSubject}</div>
                          <div style={{fontSize:11,color:'var(--ink3)',lineHeight:1.5,maxHeight:80,overflow:'hidden'}}>{lead.emailBody?.slice(0,200)}{lead.emailBody?.length>200?'…':''}</div>
                        </div>
                        {/* Follow-up 1 */}
                        <div style={{background:hasFU1?'var(--s2)':'var(--s3)',borderRadius:'var(--r)',padding:'12px',border:'1px solid var(--b)',opacity:hasFU1?1:.5}}>
                          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink3)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:8}}>Follow-up 1 · Day 5</div>
                          {hasFU1?<>
                            <div style={{fontFamily:'var(--mono)',fontSize:11,fontWeight:600,color:'var(--ink)',marginBottom:8}}>{lead.followUp1Subject}</div>
                            <div style={{fontSize:11,color:'var(--ink3)',lineHeight:1.5,maxHeight:80,overflow:'hidden'}}>{lead.followUp1Body?.slice(0,200)}{lead.followUp1Body?.length>200?'…':''}</div>
                          </>:<div style={{fontSize:11,color:'var(--ink4)',fontStyle:'italic'}}>Not generated yet</div>}
                        </div>
                        {/* Follow-up 2 (breakup) */}
                        <div style={{background:hasFU2?'var(--s2)':'var(--s3)',borderRadius:'var(--r)',padding:'12px',border:'1px solid var(--b)',opacity:hasFU2?1:.5}}>
                          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink3)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:8}}>Breakup Email · Day 12</div>
                          {hasFU2?<>
                            <div style={{fontFamily:'var(--mono)',fontSize:11,fontWeight:600,color:'var(--ink)',marginBottom:8}}>{lead.followUp2Subject}</div>
                            <div style={{fontSize:11,color:'var(--ink3)',lineHeight:1.5,maxHeight:80,overflow:'hidden'}}>{lead.followUp2Body?.slice(0,200)}{lead.followUp2Body?.length>200?'…':''}</div>
                          </>:<div style={{fontSize:11,color:'var(--ink4)',fontStyle:'italic'}}>Not generated yet</div>}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {leads.filter(l=>l.emailBody).length>3&&(
                  <div style={{marginTop:16,fontFamily:'var(--mono)',fontSize:11,color:'var(--ink3)',textAlign:'center'}}>
                    +{leads.filter(l=>l.emailBody).length-3} more sequences saved to Airtable
                  </div>
                )}
              </div>
            )}
          </>}

          {/* ══ SEND ══ */}
          {tab==='send'&&<>
            <div className="ph">
              <div className="ph-t">Send Campaign</div>
              <div className="ph-s">Warmup-aware sending · auto-enforces daily limits · Gmail API via OAuth2 · all sends logged to Airtable</div>
            </div>

            {/* STEP 1 — PROVIDER */}
            <div className="card">
              <div className="ct" style={{marginBottom:16}}>Email Provider</div>
              <div className="pt">
                {[
                  {id:'gmail',name:'Gmail (Google Workspace)',sub:'Gmail API · OAuth2 · Sends via Gmail API'},
                  {id:'gmail',name:'Gmail',sub:'Via Claude Gmail MCP · Direct send from Gmail account'},
                ].map(p=>(
                  <div key={p.id} className={`po ${provider===p.id?'a':''}`} onClick={()=>setProvider(p.id as any)}>
                    <div className="pon">{provider===p.id?'● ':''}{p.name}</div>
                    <div className="pos">{p.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* STEP 2 — VALIDATE */}
            <div className="card">
              <div className="card-hd">
                <div className="ct">Step 1 — Validate Emails</div>
                <div className="btn-row">
                  <button className="btn btn-dark" onClick={validateLeads} disabled={validating||!leads.length}>
                    {validating?'Validating...':'▶ Run Validation'}
                  </button>
                  {validation&&<span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--green)'}}>
                    ✓ {validation.summary.willSend} will send · {validation.summary.blocked} blocked
                  </span>}
                </div>
              </div>
              <p style={{fontSize:12,color:'var(--ink3)',marginBottom:16,lineHeight:1.6}}>
                Checks every contact email before sending — blocks personal addresses (Gmail, Hey, etc.), education emails (.edu), and flags role-based addresses. Prevents spam filter rejections.
              </p>

              {validation&&(
                <div style={{display:'flex',flexDirection:'column',gap:2}}>
                  {/* Summary row */}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:14}}>
                    {[
                      {label:'Ready',val:validation.summary.ready,color:'var(--green)'},
                      {label:'Role-based',val:validation.summary.role,color:'var(--yellow)'},
                      {label:'Personal',val:validation.summary.personal,color:'var(--red)'},
                      {label:'Edu',val:validation.summary.edu,color:'var(--red)'},
                      {label:'Missing',val:validation.summary.missing,color:'var(--ink4)'},
                    ].map(({label,val,color})=>(
                      <div key={label} style={{background:'var(--s2)',borderRadius:'var(--r)',padding:'10px 12px',border:'1px solid var(--b)'}}>
                        <div style={{fontFamily:'var(--sans)',fontWeight:700,fontSize:20,color:val>0?color:'var(--ink4)'}}>{val}</div>
                        <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink3)',textTransform:'uppercase',letterSpacing:'.8px',marginTop:3}}>{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Per-lead results */}
                  {/* Scrollable validation list — max 400px so page doesn't grow unbounded */}
                  <div style={{border:'1px solid var(--b)',borderRadius:'var(--r)',overflow:'hidden'}}>
                    {/* Sticky header */}
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                      <thead>
                        <tr>
                          {['Company','Email','Status','Action'].map(h=>(
                            <th key={h} style={{padding:'8px 12px',textAlign:'left',fontFamily:'var(--mono)',fontSize:9,textTransform:'uppercase',letterSpacing:'.8px',color:'var(--ink3)',background:'var(--s2)',borderBottom:'1px solid var(--b)'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                    </table>
                    {/* Scrollable body */}
                    <div style={{maxHeight:380,overflowY:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                        <tbody>
                          {validation.results.map((r:any)=>(
                            <tr key={r.id} style={{borderBottom:'1px solid var(--b)',background:r.willSend?'transparent':'#4ECDC40304'}}>
                              <td style={{padding:'9px 12px',width:'22%'}}><strong style={{fontSize:12}}>{r.company}</strong></td>
                              <td style={{padding:'9px 12px',fontFamily:'var(--mono)',fontSize:11,width:'30%',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.email||<span style={{color:'var(--ink4)',fontStyle:'italic'}}>—</span>}</td>
                              <td style={{padding:'9px 12px',width:'18%'}}>
                                <span style={{
                                  fontFamily:'var(--mono)',fontSize:9,fontWeight:600,textTransform:'uppercase',
                                  padding:'2px 8px',borderRadius:999,border:'1px solid',
                                  color:r.status==='ready'?'var(--green)':r.status==='role'?'var(--yellow)':r.status==='missing'?'var(--ink4)':'var(--red)',
                                  background:r.status==='ready'?'#16a34a10':r.status==='role'?'#d9770610':r.status==='missing'?'var(--s3)':'#4ECDC410',
                                  borderColor:r.status==='ready'?'#16a34a30':r.status==='role'?'#d9770630':r.status==='missing'?'var(--b2)':'#4ECDC430',
                                }}>
                                  {r.status==='ready'?'✓ Ready':r.status==='role'?'⚠ Role':r.status==='personal'?'✗ Personal':r.status==='edu'?'✗ Edu':r.status==='missing'?'○ Missing':'✗ Invalid'}
                                </span>
                              </td>
                              <td style={{padding:'9px 12px',fontSize:11,color:'var(--ink3)',width:'30%'}}>{r.willSend?<span style={{color:'var(--green)'}}>Will send</span>:<span style={{color:'var(--red)'}}>{r.reason}</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {validation.results.length>10&&(
                      <div style={{padding:'8px 12px',background:'var(--s2)',borderTop:'1px solid var(--b)',fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)',display:'flex',justifyContent:'space-between'}}>
                        <span>{validation.results.filter((r:any)=>r.willSend).length} will send · {validation.results.filter((r:any)=>!r.willSend).length} blocked</span>
                        <span>Scroll to see all {validation.results.length} leads ↑</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* STEP 3 — SEND */}
            <div className="card">
              <div className="card-hd">
                <div className="ct">Step 2 — Send Campaign</div>
                <div className="btn-row">
                  <button className="btn btn-red"
                    onClick={runCampaign}
                    disabled={sending||!validation||validation.summary.willSend===0}>
                    {sending?`Sending... ${sendPct}%`:
                     !validation?'Validate first →':
                     `▶ Send to ${validation.summary.willSend} leads`}
                  </button>
                  <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)'}}>{stats.sent} sent · {stats.replied} replied</span>
                </div>
              </div>

              {/* Warmup status banner */}
              {(()=>{
                const days = Math.floor((Date.now() - new Date('2026-03-28').getTime()) / 86400000)
                const week = Math.max(1, Math.min(6, Math.ceil((days + 1) / 7)))
                const limits = [{d:10,s:90},{d:20,s:75},{d:35,s:60},{d:50,s:45},{d:75,s:30},{d:100,s:20}]
                const {d: dailyMax, s: cooldownSec} = limits[week-1]
                const today = new Date().toISOString().split('T')[0]
                const sentToday = leads.filter(l=>l.status==='Email Sent'&&l.lastContacted===today).length
                const budget = Math.max(0, dailyMax - sentToday)
                const pct = Math.min(100, Math.round((sentToday/dailyMax)*100))
                return(
                  <div style={{marginBottom:16,padding:'14px 16px',background:budget===0?'#4ECDC408':'var(--s2)',border:`1px solid ${budget===0?'#4ECDC430':'var(--b)'}`,borderRadius:'var(--r)',display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
                    <div style={{flexShrink:0}}>
                      <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)',marginBottom:4}}>
                        Week {week} Warmup · {cooldownSec}s between sends
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:120,height:5,background:'var(--b2)',borderRadius:3,overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${pct}%`,background:budget===0?'var(--red2)':'var(--green)',borderRadius:3,transition:'width .3s'}}/>
                        </div>
                        <span style={{fontFamily:'var(--mono)',fontSize:11,fontWeight:600,color:budget===0?'var(--red)':budget<5?'var(--yellow)':'var(--green)'}}>
                          {sentToday}/{dailyMax} today
                        </span>
                      </div>
                    </div>
                    <div style={{flex:1,minWidth:200}}>
                      {budget===0?(
                        <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--red)'}}>⚠ Daily limit reached — come back tomorrow</span>
                      ):(
                        <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--ink3)'}}>
                          <span style={{color:'var(--ink)',fontWeight:600}}>{budget} emails</span> remaining today
                          {week<4&&<span style={{color:'var(--ink4)'}}> · limit increases to {limits[week]?.d||100}/day next week</span>}
                        </span>
                      )}
                    </div>
                    <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',textAlign:'right',flexShrink:0}}>
                      {week===1&&'Gentle start'}{week===2&&'Building trust'}{week===3&&'Gaining momentum'}
                      {week===4&&'Good standing'}{week>=5&&'Fully warmed ✓'}
                    </div>
                  </div>
                )
              })()}

              {!validation&&(
                <div className="alert aw" style={{marginBottom:0}}>
                  <span className="alert-icon">⚠</span>
                  <div className="alert-body">
                    <div className="alert-title">Run validation before sending</div>
                    Sending without validation caused the previous spam block. Gmail blocks bulk sends to personal/invalid addresses.
                  </div>
                </div>
              )}

              {sending&&(
                <div className="pgwrap">
                  <div className="pglbl"><span>Sending...</span><span>{sendPct}%</span></div>
                  <div className="pgbar"><div className="pgfill" style={{width:`${sendPct}%`}}/></div>
                </div>
              )}

              {/* System checklist */}
              <div className="cklist" style={{marginTop:16}}>
                {[
                  {lbl:'Airtable connected',ok:health?.airtable?.ok??false,soft:false},
                  {lbl:'Gmail API verified',ok:health?.gmail?.ok??false,soft:!!health?.env?.gmailEmail&&!health?.gmail?.ok},
                  {lbl:'Emails generated',ok:stats.hasEmail>0,soft:false},
                  {lbl:'Validation complete',ok:!!validation,soft:false},
                  {lbl:`${validation?.summary?.willSend??0} leads cleared for sending`,ok:(validation?.summary?.willSend??0)>0,soft:false},
                ].map(({lbl,ok,soft}:{lbl:string,ok:boolean,soft:boolean})=>(
                  <div key={lbl} className="crow">
                    <span className="ci" style={{color:ok?'var(--green)':soft?'var(--yellow)':'var(--ink4)'}}>{ok?'✓':soft?'⚠':'○'}</span>
                    <span style={{color:ok?'var(--ink)':'var(--ink3)'}}>{lbl}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* SPAM TIPS */}
            <div className="card" style={{background:'var(--s2)'}}>
              <div className="ct" style={{marginBottom:12}}>Improving Deliverability</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                {[
                  {ico:'✗',title:'Blocked — use Hunter.io/Apollo to replace',items:['Personal emails (Gmail, Hey, Outlook)','Education emails (.edu)','Generic inferred emails for unknown contacts']},
                  {ico:'✓',title:'Best practices to avoid spam filters',items:['Warm up domain — send 5–10 manual emails first','Space sends 45s apart (already enforced)','Each email has HTML + plain text (already done)','Unsubscribe link in every email (already added)']},
                ].map(({ico,title,items})=>(
                  <div key={title} style={{padding:'14px 16px',background:'var(--s1)',borderRadius:'var(--r)',border:'1px solid var(--b)'}}>
                    <div style={{fontFamily:'var(--mono)',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'1px',color:'var(--ink3)',marginBottom:10}}>{ico} {title}</div>
                    {items.map(item=>(
                      <div key={item} style={{fontSize:11,color:'var(--ink3)',padding:'3px 0',display:'flex',gap:8,alignItems:'flex-start'}}>
                        <span style={{color:'var(--ink4)',flexShrink:0}}>·</span>{item}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="ct" style={{marginBottom:14}}>Campaign Log</div>
              <Logbox/>
            </div>
          </>}

          {/* ══ INBOX ══ */}
          {tab==='inbox'&&(()=>{
            const replied   = leads.filter(l=>l.replyText||['Replied','Booked'].includes(l.sequenceStatus))
            const pending   = replied.filter(l=>!l.replySent)
            const done      = replied.filter(l=>l.replySent)
            const active    = inboxLead || pending[0] || null

            const intentColor=(i:string)=>i==='interested'?'var(--green)':i==='not_now'?'var(--yellow)':i==='question'?'var(--blue)':i==='unsubscribe'?'var(--red)':'var(--ink3)'
            const intentBg=(i:string)=>i==='interested'?'#16a34a12':i==='not_now'?'#d9770612':i==='question'?'#2563eb12':i==='unsubscribe'?'#4ECDC412':'var(--s3)'
            const intentLabel=(i:string)=>i==='interested'?'🔥 Interested':i==='not_now'?'⏳ Not Now':i==='question'?'❓ Question':i==='unsubscribe'?'🚫 Unsubscribe':'💬 Other'

            const sendReply=async(lead:Lead)=>{
              const draft=replyDraft[lead.id]||lead.suggestedReply||''
              if(!draft.trim()){toast('Write a reply first','w');return}
              setSendingReply(lead.id)
              try{
                const r=await fetch('/api/send-reply',{method:'POST',headers:{'Content-Type':'application/json'},
                  body:JSON.stringify({
                    recordId:   lead.id,
                    to:         lead.contactEmail,
                    subject:    lead.emailSubject,
                    body:       draft,
                    inReplyToSubject: lead.emailSubject,
                    company:          lead.company,
                  })
                }).then(r=>r.json())
                if(!r.ok)throw new Error(r.error)
                toast(`Reply sent to ${lead.company}`,'o')
                setLeads(p=>p.map(l=>l.id===lead.id?{...l,replySent:true}:l))
                // Move to next pending
                const nextPending=pending.filter(p=>p.id!==lead.id)[0]
                setInboxLead(nextPending||null)
              }catch(e:any){toast(`Send failed: ${e.message}`,'e')}
              setSendingReply(null)
            }

            return(
              <>
                <div className="ph">
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
                    <div>
                      <div className="ph-t">Inbox</div>
                      <div className="ph-s">Replies + bounces detected by IMAP · Claude classifies intent · reply in one click</div>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
                      {lastScanResult&&<span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink4)'}}>
                        Last scan: {lastScanResult.scanned} msgs · {lastScanResult.newReplies} replies · {lastScanResult.newBounces} bounces
                      </span>}
                      <button className="btn btn-dark" onClick={()=>scanInbox(60)} disabled={scanningInbox}>
                        {scanningInbox?'Scanning...':'📬 Scan Inbox Now'}
                      </button>
                    </div>
                  </div>
                </div>

                {replied.length===0?(
                  <div className="card">
                    <div className="empty">
                      <div className="empty-ico">📬</div>
                      <div className="empty-t">No replies yet</div>
                      <div className="empty-s">When leads reply, Claude classifies them and they appear here for one-click response. Cron checks daily at 9am UTC.</div>
                    </div>
                  </div>
                ):(
                  <div style={{display:'grid',gridTemplateColumns:'280px 1fr',gap:16,alignItems:'start'}}>

                    {/* LEFT: reply list */}
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      {pending.length>0&&(
                        <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink3)',textTransform:'uppercase',letterSpacing:'1px',padding:'0 4px',marginBottom:2}}>
                          Needs reply · {pending.length}
                        </div>
                      )}
                      {pending.map(lead=>(
                        <div key={lead.id}
                          onClick={()=>{setInboxLead(lead);setReplyDraft(p=>({...p,[lead.id]:p[lead.id]??lead.suggestedReply??''}))}}
                          style={{background:'var(--s1)',border:`1.5px solid ${active?.id===lead.id?'var(--red2)':'var(--b)'}`,borderRadius:'var(--r)',padding:'12px 14px',cursor:'pointer',transition:'all .12s',boxShadow:active?.id===lead.id?'0 0 0 3px #4ECDC415':'var(--sh)'}}>
                          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                            <strong style={{fontSize:13}}>{lead.company}</strong>
                            <span style={{fontFamily:'var(--mono)',fontSize:9,padding:'2px 7px',borderRadius:10,background:intentBg(lead.replyIntent),color:intentColor(lead.replyIntent)}}>
                              {intentLabel(lead.replyIntent)}
                            </span>
                          </div>
                          <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)',marginBottom:4}}>{lead.contactEmail}</div>
                          {lead.replyText&&<div style={{fontSize:11,color:'var(--ink3)',lineHeight:1.4,maxHeight:36,overflow:'hidden'}}>{lead.replyText.slice(0,100)}{lead.replyText.length>100?'…':''}</div>}
                        </div>
                      ))}
                      {done.length>0&&(
                        <>
                          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'1px',padding:'8px 4px 2px',marginTop:4}}>
                            Replied · {done.length}
                          </div>
                          {done.map(lead=>(
                            <div key={lead.id}
                              onClick={()=>{setInboxLead(lead);setReplyDraft(p=>({...p,[lead.id]:p[lead.id]??lead.suggestedReply??''}))}}
                              style={{background:'var(--s2)',border:`1px solid ${active?.id===lead.id?'var(--red2)':'var(--b)'}`,borderRadius:'var(--r)',padding:'10px 14px',cursor:'pointer',opacity:.7,transition:'border .12s'}}>
                              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                                <span style={{fontSize:12,fontWeight:600,color:'var(--ink3)'}}>{lead.company}</span>
                                <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--green)'}}>✓ sent</span>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>

                    {/* RIGHT: active lead compose panel */}
                    {active?(
                      <div style={{display:'flex',flexDirection:'column',gap:12}}>

                        {/* Header */}
                        <div style={{background:'var(--s1)',border:'1px solid var(--b)',borderRadius:'var(--r2)',padding:'18px 20px',boxShadow:'var(--sh)'}}>
                          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12}}>
                            <div>
                              <div style={{fontFamily:'var(--sans)',fontWeight:800,fontSize:18,letterSpacing:'-.4px'}}>{active.company}</div>
                              <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--ink3)',marginTop:3}}>{active.contactName&&<span>{active.contactName} · </span>}{active.contactEmail}</div>
                            </div>
                            <span style={{fontFamily:'var(--mono)',fontSize:11,padding:'4px 12px',borderRadius:20,background:intentBg(active.replyIntent),color:intentColor(active.replyIntent),fontWeight:600}}>
                              {intentLabel(active.replyIntent)}
                            </span>
                          </div>
                          {/* Their reply */}
                          {active.replyText&&(
                            <div style={{background:'var(--s2)',borderRadius:'var(--r)',padding:'14px',border:'1px solid var(--b)',marginBottom:0}}>
                              <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:8}}>Their Reply</div>
                              <div style={{fontSize:13,color:'var(--ink)',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{active.replyText}</div>
                            </div>
                          )}
                        </div>

                        {/* Original email context */}
                        <div style={{background:'var(--s1)',border:'1px solid var(--b)',borderRadius:'var(--r2)',padding:'16px 20px',boxShadow:'var(--sh)'}}>
                          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:10}}>Original Email Sent</div>
                          <div style={{fontFamily:'var(--mono)',fontSize:11,fontWeight:600,color:'var(--ink)',marginBottom:8}}>{active.emailSubject}</div>
                          <div style={{fontSize:12,color:'var(--ink3)',lineHeight:1.5,maxHeight:80,overflow:'hidden'}}>{active.emailBody?.slice(0,300)}{active.emailBody?.length>300?'…':''}</div>
                        </div>

                        {/* Reply compose */}
                        <div style={{background:'var(--s1)',border:'1px solid var(--b)',borderRadius:'var(--r2)',padding:'18px 20px',boxShadow:'var(--sh)'}}>
                          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                            <div>
                              <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:2}}>Your Reply</div>
                              <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)'}}>To: {active.contactEmail} · Re: {active.emailSubject}</div>
                            </div>
                            {active.suggestedReply&&!(replyDraft[active.id])&&(
                              <button className="btn btn-ghost btn-xs" onClick={()=>setReplyDraft(p=>({...p,[active.id]:active.suggestedReply}))}>
                                Use Claude suggestion
                              </button>
                            )}
                          </div>
                          <textarea
                            value={replyDraft[active.id]??active.suggestedReply??''}
                            onChange={e=>setReplyDraft(p=>({...p,[active.id]:e.target.value}))}
                            placeholder="Write your reply here, or click 'Use Claude suggestion' above..."
                            style={{width:'100%',minHeight:140,fontFamily:'var(--body)',fontSize:13,lineHeight:1.6,padding:'12px',borderRadius:'var(--r)',border:'1px solid var(--b2)',background:'var(--s2)',color:'var(--ink)',resize:'vertical',outline:'none',boxSizing:'border-box'}}
                          />
                          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:12}}>
                            <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink4)'}}>
                              Sends via Gmail API from brandon@tradecafe.ai
                            </div>
                            <div style={{display:'flex',gap:8}}>
                              {active.replyIntent==='unsubscribe'&&(
                                <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--red)',padding:'4px 10px',background:'#4ECDC410',borderRadius:'var(--r)'}}>⚠ Unsubscribe — keep reply brief</span>
                              )}
                              <button
                                className="btn btn-red"
                                onClick={()=>sendReply(active)}
                                disabled={sendingReply===active.id||active.replySent||(!replyDraft[active.id]&&!active.suggestedReply)}
                              >
                                {sendingReply===active.id?'Sending...'
                                  :active.replySent?'✓ Reply Sent'
                                  :'Send Reply →'}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Claude suggested reply (read-only reference if already edited) */}
                        {active.suggestedReply&&replyDraft[active.id]&&replyDraft[active.id]!==active.suggestedReply&&(
                          <div style={{background:'var(--s2)',border:'1px solid var(--b)',borderRadius:'var(--r)',padding:'14px 16px'}}>
                            <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:8}}>Claude Original Suggestion</div>
                            <div style={{fontSize:12,color:'var(--ink3)',lineHeight:1.5,whiteSpace:'pre-wrap'}}>{active.suggestedReply}</div>
                          </div>
                        )}

                      </div>
                    ):(
                      <div style={{background:'var(--s1)',border:'1px solid var(--b)',borderRadius:'var(--r2)',padding:'40px',textAlign:'center',boxShadow:'var(--sh)'}}>
                        <div style={{fontSize:28,marginBottom:12}}>👆</div>
                        <div style={{fontFamily:'var(--sans)',fontWeight:700,fontSize:14,color:'var(--ink)',marginBottom:6}}>Select a reply to compose</div>
                        <div style={{fontFamily:'var(--body)',fontSize:12,color:'var(--ink3)'}}>Click any lead on the left to open their reply and send a response</div>
                      </div>
                    )}

                  </div>
                )}
              </>
            )
          })()}


          {/* ══ ANALYTICS ══ */}
          {tab==='analytics'&&(()=>{
            const total     = leads.length
            const withEmail = leads.filter(l=>l.contactEmail).length
            const withSeq   = leads.filter(l=>l.emailBody).length
            const sent      = leads.filter(l=>l.status==='Email Sent').length
            const replied   = leads.filter(l=>l.status==='Replied').length
            const booked    = leads.filter(l=>l.status==='Booked Call').length
            const opened    = leads.filter(l=>l.openCount>0).length
            const bounced   = leads.filter(l=>l.bounced).length
            const disq      = leads.filter(l=>l.disqualified).length
            const avgScore  = leads.length>0?Math.round(leads.reduce((s,l)=>s+(l.leadScore||0),0)/leads.length):0
            const queued    = leads.filter(l=>l.status==='New'&&l.emailBody&&l.contactEmail).length

            const byDate: Record<string,number> = {}
            leads.forEach(l=>{if(l.lastContacted&&l.status==='Email Sent')byDate[l.lastContacted]=(byDate[l.lastContacted]||0)+1})
            const dateKeys = Object.keys(byDate).sort()
            const maxDay   = Math.max(...dateKeys.map(d=>byDate[d]),1)

            const tm: Record<string,number>={}
            leads.forEach(l=>{const t=l.companyType||'Unknown';tm[t]=(tm[t]||0)+1})
            const types   = Object.entries(tm).sort((a,b)=>b[1]-a[1])
            const tColors = ['#4ECDC4','#2563eb','#16a34a','#d97706','#7c3aed','#6b7280']
            const circ    = 2*Math.PI*50

            const ABar=({pct,col,h=8,delay=0}:{pct:number,col:string,h?:number,delay?:number})=>(
              <div style={{height:h,background:'var(--b2)',borderRadius:4,overflow:'hidden'}}>
                <div className="bar-grow" style={{height:'100%',width:`${Math.max(pct,0)}%`,background:col,borderRadius:4,animationDelay:`${delay}ms`,transformOrigin:'left'}}/>
              </div>
            )

            return(
              <>
                <div className="ph">
                  <div className="ph-t">Analytics</div>
                  <div className="ph-s">Live from {total} leads · {sent} emails sent · updated on load</div>
                </div>

                {/* KPI bento row */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:12}}>
                  {[
                    {lbl:'Total Leads',v:total,   c:'var(--ink)', bg:'var(--s1)'},
                    {lbl:'Emails Sent',v:sent,    c:'#4ECDC4',   bg:'#4ECDC406'},
                    {lbl:'Opens',      v:opened,  c:'#0891b2',   bg:'#0891b206'},
                    {lbl:'Replies',    v:replied, c:'#16a34a',   bg:'#16a34a06'},
                    {lbl:'Queued',     v:queued,  c:'#d97706',   bg:'#d9770606'},
                    {lbl:'High-Fit',   v:leads.filter(l=>l.leadScore>60).length,c:'#7c3aed',bg:'#7c3aed06'},
                    {lbl:'Avg Score',  v:avgScore,c:'var(--ink3)',bg:'var(--s2)'},
                    {lbl:'Booked',     v:booked,  c:'#4ECDC4',   bg:'#4ECDC406'},
                  ].map((s,i)=>(
                    <div key={s.lbl} className="bcell fade-up" style={{background:s.bg,padding:'16px 18px',animationDelay:`${i*35}ms`}}>
                      <div className="count-up" style={{fontFamily:'var(--sans)',fontWeight:800,fontSize:32,letterSpacing:'-2px',color:s.c,lineHeight:1,animationDelay:`${i*35}ms`}}>{s.v}</div>
                      <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:'.8px',marginTop:7}}>{s.lbl}</div>
                    </div>
                  ))}
                </div>

                {/* Funnel + Send Activity */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                  <div className="bcell">
                    <div className="card-hd" style={{marginBottom:14}}><div className="ct">Outreach Funnel</div></div>
                    {[
                      {lbl:'Total leads',v:total,   c:'#6b7280',d:0},
                      {lbl:'Has email',  v:withEmail,c:'#2563eb',d:50},
                      {lbl:'Has sequence',v:withSeq, c:'#7c3aed',d:100},
                      {lbl:'Sent',       v:sent,    c:'#d97706',d:150},
                      {lbl:'Opened',     v:opened,  c:'#0891b2',d:200},
                      {lbl:'Replied',    v:replied, c:'#16a34a',d:250},
                      {lbl:'Booked',     v:booked,  c:'#4ECDC4',d:300},
                    ].map(s=>{
                      const pct=total>0?Math.round(s.v/total*100):0
                      return(
                        <div key={s.lbl} className="fade-up" style={{marginBottom:10,animationDelay:`${s.d}ms`}}>
                          <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,alignItems:'center'}}>
                            <div style={{display:'flex',alignItems:'center',gap:7}}>
                              <div style={{width:6,height:6,borderRadius:'50%',background:s.c,boxShadow:`0 0 5px ${s.c}70`}}/>
                              <span style={{fontFamily:'var(--mono)',fontSize:11}}>{s.lbl}</span>
                            </div>
                            <div style={{display:'flex',gap:10,alignItems:'center'}}>
                              <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)'}}>{pct}{'%'}</span>
                              <span style={{fontFamily:'var(--mono)',fontSize:12,fontWeight:700,minWidth:28,textAlign:'right'}}>{s.v}</span>
                            </div>
                          </div>
                          <ABar pct={pct} col={s.c} h={10} delay={s.d+100}/>
                        </div>
                      )
                    })}
                  </div>

                  <div className="bcell">
                    <div className="card-hd" style={{marginBottom:14}}>
                      <div className="ct">Send Activity</div>
                      <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)'}}>{sent} total · {dateKeys.length} days</span>
                    </div>
                    {dateKeys.length===0?(
                      <div style={{padding:'40px 0',textAlign:'center',fontFamily:'var(--mono)',fontSize:11,color:'var(--ink4)'}}>No sends yet</div>
                    ):(
                      <>
                        <div style={{display:'flex',alignItems:'flex-end',gap:8,height:130,paddingBottom:24,position:'relative',borderBottom:'1px solid var(--b)'}}>
                          {[.25,.5,.75,1].map(p=>(
                            <div key={p} style={{position:'absolute',left:0,right:0,bottom:24+106*p,borderTop:'1px dashed var(--b)',opacity:.4}}/>
                          ))}
                          {dateKeys.map((date,i)=>{
                            const val=byDate[date]
                            const h=Math.max(6,Math.round((val/maxDay)*106))
                            const d2=new Date(date+'T12:00:00')
                            return(
                              <div key={date} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',height:'100%',justifyContent:'flex-end',position:'relative',zIndex:1}}>
                                <span className="fade-up" style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink3)',marginBottom:3,animationDelay:`${i*60}ms`}}>{val}</span>
                                <div className="bar-grow" style={{width:'68%',height:h,background:'linear-gradient(to top,#4ECDC4,#4ECDC4aa)',borderRadius:'3px 3px 0 0',boxShadow:'0 -2px 8px #4ECDC430',animationDelay:`${i*60}ms`,transformOrigin:'bottom'}}/>
                                <span style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--ink4)',position:'absolute',bottom:0}}>{`${d2.getMonth()+1}/${d2.getDate()}`}</span>
                              </div>
                            )
                          })}
                        </div>
                        <div style={{marginTop:10,display:'flex',gap:16,fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)'}}>
                          <span>Peak <strong>{Math.max(...dateKeys.map(d=>byDate[d]))}</strong>/day</span>
                          <span>Avg <strong>{Math.round(sent/Math.max(dateKeys.length,1))}</strong>/day</span>
                          <span><strong>{queued}</strong> queued</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Conversion Rates + Score + Donut */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:12}}>
                  <div className="bcell">
                    <div className="card-hd" style={{marginBottom:14}}><div className="ct">Conversion Rates</div></div>
                    {[
                      {lbl:'Lead → Contact',n:withEmail,d:total,   tgt:80, delay:0},
                      {lbl:'Contact → Sent',n:sent,    d:withEmail,tgt:100,delay:60},
                      {lbl:'Sent → Opened', n:opened,  d:sent,     tgt:30, delay:120},
                      {lbl:'Sent → Replied',n:replied, d:sent,     tgt:5,  delay:180},
                      {lbl:'Reply → Booked',n:booked,  d:replied,  tgt:30, delay:240},
                    ].map(r=>{
                      const pct=r.d>0?Math.round(r.n/r.d*100):0
                      const col=pct>=r.tgt?'#16a34a':pct>=r.tgt*0.5?'#d97706':'#4ECDC4'
                      return(
                        <div key={r.lbl} className="fade-up" style={{marginBottom:14,animationDelay:`${r.delay}ms`}}>
                          <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,alignItems:'flex-end'}}>
                            <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)'}}>{r.lbl}</span>
                            <div style={{display:'flex',alignItems:'baseline',gap:6}}>
                              <span style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--ink4)'}}>{r.n}/{r.d}</span>
                              <span style={{fontFamily:'var(--sans)',fontWeight:800,fontSize:18,letterSpacing:'-1px',color:col,lineHeight:1}}>{pct}{'%'}</span>
                            </div>
                          </div>
                          <ABar pct={Math.min(100,r.tgt>0?Math.round(pct/r.tgt*100):0)} col={col} h={5} delay={r.delay+200}/>
                          <div style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--ink4)',marginTop:2}}>target {r.tgt}{'%'}</div>
                        </div>
                      )
                    })}
                    <div style={{marginTop:6,padding:'8px 10px',background:'var(--s2)',borderRadius:'var(--r)',fontFamily:'var(--body)',fontSize:10,color:'var(--ink3)',lineHeight:1.5}}>
                      2–5% good · 5–10% great · 10%+ exceptional
                    </div>
                  </div>

                  <div className="bcell">
                    <div className="card-hd" style={{marginBottom:14}}>
                      <div className="ct">Lead Score</div>
                      <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink3)'}}>avg {avgScore}</span>
                    </div>
                    {(()=>{
                      const buckets=[
                        {lbl:'81–100',n:leads.filter(l=>l.leadScore>80).length,c:'#4ECDC4',d:0},
                        {lbl:'61–80', n:leads.filter(l=>l.leadScore>60&&l.leadScore<=80).length,c:'#16a34a',d:80},
                        {lbl:'41–60', n:leads.filter(l=>l.leadScore>40&&l.leadScore<=60).length,c:'#d97706',d:160},
                        {lbl:'21–40', n:leads.filter(l=>l.leadScore>20&&l.leadScore<=40).length,c:'#2563eb',d:240},
                        {lbl:'0–20',  n:leads.filter(l=>l.leadScore>=0&&l.leadScore<=20).length,c:'#6b7280',d:320},
                      ]
                      const mx=Math.max(...buckets.map(b=>b.n),1)
                      return buckets.map(b=>(
                        <div key={b.lbl} className="fade-up" style={{marginBottom:12,animationDelay:`${b.d}ms`}}>
                          <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,alignItems:'center'}}>
                            <div style={{display:'flex',alignItems:'center',gap:7}}>
                              <div style={{width:6,height:6,borderRadius:2,background:b.c}}/>
                              <span style={{fontFamily:'var(--mono)',fontSize:11}}>{b.lbl}</span>
                            </div>
                            <div style={{display:'flex',gap:7,alignItems:'center'}}>
                              <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink3)'}}>{total>0?Math.round(b.n/total*100):0}{'%'}</span>
                              <span style={{fontFamily:'var(--mono)',fontSize:12,fontWeight:700,minWidth:24,textAlign:'right'}}>{b.n}</span>
                            </div>
                          </div>
                          <ABar pct={mx>0?Math.round(b.n/mx*100):0} col={b.c} h={12} delay={b.d+100}/>
                        </div>
                      ))
                    })()}
                    <div style={{marginTop:8,padding:'8px 10px',background:'var(--s2)',borderRadius:'var(--r)',fontFamily:'var(--body)',fontSize:10,color:'var(--ink3)'}}>
                      {leads.filter(l=>l.leadScore>60&&l.contactEmail).length} high-fit leads ready to send
                    </div>
                  </div>

                  <div className="bcell">
                    <div className="card-hd" style={{marginBottom:14}}><div className="ct">Company Types</div></div>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
                      <svg width={120} height={120} className="count-up">
                        <circle cx={60} cy={60} r={50} fill="none" stroke="var(--b2)" strokeWidth={14}/>
                        {(()=>{let offset=0;return types.map(([lbl,cnt],i)=>{
                          const pct=cnt/Math.max(total,1),dash=circ*pct,gap=circ*(1-pct),rot=offset*360
                          offset+=pct
                          return(<circle key={lbl} cx={60} cy={60} r={50} fill="none" stroke={tColors[i%tColors.length]} strokeWidth={14} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-(rot/360)*circ+(circ/4)} style={{filter:`drop-shadow(0 0 3px ${tColors[i%tColors.length]}50)`}}/>)
                        })})()}
                        <text x={60} y={56} textAnchor="middle" fill="var(--ink)" fontSize={18} fontWeight={800} fontFamily="var(--sans)">{total}</text>
                        <text x={60} y={70} textAnchor="middle" fill="var(--ink4)" fontSize={8} fontFamily="var(--mono)">LEADS</text>
                      </svg>
                      <div style={{width:'100%'}}>
                        {types.map(([lbl,cnt],i)=>(
                          <div key={lbl} className="fade-up" style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:7,animationDelay:`${i*50}ms`}}>
                            <div style={{display:'flex',alignItems:'center',gap:6}}>
                              <div style={{width:7,height:7,borderRadius:2,background:tColors[i%tColors.length]}}/>
                              <span style={{fontFamily:'var(--body)',fontSize:10}}>{lbl}</span>
                            </div>
                            <div style={{display:'flex',gap:6,alignItems:'center'}}>
                              <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink3)'}}>{Math.round(cnt/Math.max(total,1)*100)}{'%'}</span>
                              <span style={{fontFamily:'var(--mono)',fontSize:11,fontWeight:700,minWidth:22,textAlign:'right'}}>{cnt}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ICP Breakdown bento */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10,minWidth:0}}>
                  {[
                    {lbl:'High-Fit',    sub:'Score 61+',        n:leads.filter(l=>l.leadScore>60&&l.contactEmail&&!l.disqualified).length,   c:'#16a34a',action:'Prioritise first'},
                    {lbl:'Mid-Fit',     sub:'Score 21–60',      n:leads.filter(l=>l.leadScore>20&&l.leadScore<=60&&l.contactEmail&&!l.disqualified).length, c:'#d97706',action:'Bulk sequence'},
                    {lbl:'Low Signal',  sub:'Score 0–20',       n:leads.filter(l=>l.leadScore<=20&&!l.disqualified).length,c:'#6b7280',action:'Consider disqualify'},
                    {lbl:'No Email',    sub:'Missing contact',  n:leads.filter(l=>!l.contactEmail&&!l.disqualified).length,c:'#2563eb',action:'Run Hunter'},
                    {lbl:'Bounced',     sub:'Invalid address',  n:bounced,c:'#4ECDC4',action:'Find replacement'},
                    {lbl:'Disqualified',sub:'Removed from pipe',n:disq,c:'var(--b2)',action:'Not in pipeline'},
                  ].map((m,i)=>(
                    <div key={m.lbl} className="bcell fade-up" style={{padding:'14px 16px',animationDelay:`${i*40}ms`}}>
                      <div style={{fontFamily:'var(--sans)',fontWeight:800,fontSize:26,letterSpacing:'-1.5px',color:m.c,lineHeight:1,marginBottom:5}}>{m.n}</div>
                      <div style={{fontFamily:'var(--body)',fontSize:11,fontWeight:600,color:'var(--ink)',marginBottom:2}}>{m.lbl}</div>
                      <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink4)',marginBottom:6}}>{m.sub}</div>
                      <div style={{fontFamily:'var(--mono)',fontSize:8,padding:'2px 7px',borderRadius:8,display:'inline-block',background:'var(--s2)',color:'var(--ink4)'}}>{m.action}</div>
                    </div>
                  ))}
                </div>
              </>
            )
          })()}


        </div>
      </div>
    </>
  )
}

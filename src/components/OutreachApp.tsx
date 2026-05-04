'use client'
import{useState,useEffect,useCallback,useRef}from'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Lead{
  id:string;company:string;contactName:string;contactEmail:string;companyType:string
  website:string;status:string;seqStatus:string;subject:string;body:string
  fu1Sub:string;fu1Body:string;fu2Sub:string;fu2Body:string
  notes:string;source:string;score:number;replyText:string;replyIntent:string
  suggestedReply:string;replySent:boolean;jobTitle:string;followers:number
  githubUrl:string;xUrl:string;linkedinUrl:string;bounced:boolean
  [k:string]:any
}
interface Discovered{org:string;name:string;type:string;website?:string;url?:string;source?:string;description?:string;score?:number;followers?:number;symbol?:string;marketCap?:number;priceChange24h?:number}
type Tab='discover'|'crm'|'generate'|'send'|'inbox'
type LogT='i'|'o'|'e'|'w'
type Src='coingecko'|'github'|'coinmarketcap'|'tradingview'|'x'|'linkedin'|'yc'|'hackernews'

const SRC_DEF:{id:Src;label:string;icon:string;desc:string;free:boolean;envKey?:string}[]=[
  {id:'coingecko',label:'CoinGecko',icon:'🦎',desc:'Trending coins · gainers · DeFi protocols',free:true},
  {id:'github',label:'GitHub',icon:'⚡',desc:'Crypto/trading open source orgs',free:true},
  {id:'coinmarketcap',label:'CoinMarketCap',icon:'📊',desc:'Trending · new listings · gainers',free:false,envKey:'CMC_API_KEY'},
  {id:'tradingview',label:'TradingView',icon:'📈',desc:'Popular analysts · idea publishers',free:true},
  {id:'x',label:'X / Twitter',icon:'𝕏',desc:'Crypto KOLs · trading influencers',free:true},
  {id:'linkedin',label:'LinkedIn',icon:'💼',desc:'Crypto companies · Proxycurl',free:false,envKey:'PROXYCURL_API_KEY'},
  {id:'yc',label:'YC Startups',icon:'🚀',desc:'YC-backed crypto/DeFi startups',free:true},
  {id:'hackernews',label:'Hacker News',icon:'🗞',desc:'Crypto/trading hiring threads',free:true},
]

const SRC_ROUTES:Record<Src,string>={
  coingecko:'/api/discover-cg?mode=trending',
  github:'/api/discover',
  coinmarketcap:'/api/discover-cmc?mode=trending',
  tradingview:'/api/discover-tv',
  x:'/api/discover-x',
  linkedin:'/api/discover-li',
  yc:'/api/discover-ph',
  hackernews:'/api/discover-hn',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mapRecord(r:any):Lead{
  const f=r.fields||{}
  return{
    id:r.id,company:f['Company']||f['Name']||'',contactName:f['Contact Name']||'',
    contactEmail:f['Contact Email']||'',companyType:f['Company Type']||'',
    website:f['Website']||'',status:f['Status']||'New',seqStatus:f['Sequence Status']||'Cold',
    subject:f['Email Subject']||'',body:f['Email Body']||'',
    fu1Sub:f['Follow-up 1 Subject']||'',fu1Body:f['Follow-up 1 Body']||'',
    fu2Sub:f['Follow-up 2 Subject']||'',fu2Body:f['Follow-up 2 Body']||'',
    notes:f['Notes']||f['Personalization Notes']||'',source:f['Source']||'',
    score:f['Lead Score']||0,replyText:f['Reply Text']||'',
    replyIntent:f['Reply Intent']||'',suggestedReply:f['Suggested Reply']||'',
    replySent:!!f['Reply Sent'],jobTitle:f['Job Title']||'',
    followers:f['Followers/Audience Size']||0,
    githubUrl:f['GitHub Org URL']||'',xUrl:f['X/Twitter URL']||'',
    linkedinUrl:f['LinkedIn URL']||'',bounced:!!f['Bounced'],
  }
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS=`
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
:root{
  --bg:#060609;--s1:#0c0c12;--s2:#111118;--s3:#17171f;--s4:#1d1d27;
  --b:rgba(255,255,255,0.06);--b2:rgba(255,255,255,0.1);--b3:rgba(255,255,255,0.15);
  --ink:#e2e4e9;--ink2:#a0a4b0;--ink3:#6b7080;--ink4:#454858;
  --acc:#4ECDC4;--acc2:#00E5A0;--acc3:#7B61FF;
  --red:#FF6B6B;--yellow:#FFB800;--green:#00E5A0;
  --mono:'JetBrains Mono',monospace;--sans:'Inter',sans-serif;
}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:13px;-webkit-font-smoothing:antialiased}
::selection{background:#4ECDC420}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--b2);border-radius:2px}

.app{display:flex;flex-direction:column;height:100vh;overflow:hidden}

/* Top bar */
.top{display:flex;align-items:center;justify-content:space-between;padding:10px 20px;border-bottom:1px solid var(--b);background:var(--s1)}
.logo{display:flex;align-items:center;gap:8px}
.logo-dot{width:8px;height:8px;border-radius:50%;background:var(--acc);box-shadow:0 0 12px var(--acc)}
.logo-t{font-family:var(--mono);font-size:14px;font-weight:700;letter-spacing:1px;color:var(--ink)}
.logo-tag{font-family:var(--mono);font-size:9px;font-weight:700;letter-spacing:1.5px;padding:2px 8px;border-radius:3px;background:var(--acc);color:var(--bg);text-transform:uppercase}

/* Nav */
.nav{display:flex;border-bottom:1px solid var(--b);background:var(--s1);overflow-x:auto}
.nav-btn{font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding:12px 20px;border:none;background:none;color:var(--ink3);cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;transition:all .15s}
.nav-btn:hover{color:var(--ink2)}
.nav-btn.on{color:var(--acc);border-bottom-color:var(--acc)}
.nav-cnt{font-family:var(--mono);font-size:9px;margin-left:6px;padding:1px 6px;border-radius:3px;background:var(--s3);color:var(--ink3)}

/* Main */
.main{flex:1;overflow-y:auto;padding:20px}

/* Cards */
.card{background:var(--s1);border:1px solid var(--b);border-radius:8px;padding:16px 20px;margin-bottom:12px}
.card-t{font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink2);margin-bottom:12px;display:flex;align-items:center;gap:8px}
.card-t::before{content:'';width:3px;height:12px;background:linear-gradient(180deg,var(--acc),var(--acc3));border-radius:2px}

/* Source pills */
.src-grid{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
.src-pill{display:flex;flex-direction:column;gap:2px;padding:10px 14px;border-radius:6px;border:1px solid var(--b);background:var(--s2);cursor:pointer;transition:all .12s;min-width:140px;flex:1}
.src-pill:hover{border-color:var(--b2);background:var(--s3)}
.src-pill.on{border-color:var(--acc);background:#4ECDC408}
.src-top{display:flex;align-items:center;gap:6px}
.src-icon{font-size:14px}
.src-label{font-family:var(--mono);font-size:11px;font-weight:700;color:var(--ink)}
.src-pill.on .src-label{color:var(--acc)}
.src-badge{font-family:var(--mono);font-size:8px;color:var(--acc);margin-left:auto}
.src-desc{font-family:var(--sans);font-size:10px;color:var(--ink4);line-height:1.3}
.src-free{font-family:var(--mono);font-size:8px;padding:1px 5px;border-radius:2px;background:#00E5A010;color:var(--acc2);border:1px solid #00E5A020}

/* Buttons */
.btn{font-family:var(--mono);font-size:11px;font-weight:600;padding:8px 16px;border-radius:5px;border:1px solid var(--b);background:var(--s2);color:var(--ink2);cursor:pointer;transition:all .12s;letter-spacing:.5px}
.btn:hover:not(:disabled){background:var(--s3);border-color:var(--b2);color:var(--ink)}
.btn:disabled{opacity:.35;cursor:not-allowed}
.btn-acc{background:var(--acc);color:var(--bg);border-color:var(--acc);font-weight:700}
.btn-acc:hover:not(:disabled){background:var(--acc2)}
.btn-red{background:var(--red);color:#fff;border-color:var(--red)}
.btn-sm{font-size:10px;padding:5px 10px}
.btn-row{display:flex;gap:6px;flex-wrap:wrap}

/* Lead rows */
.lead-row{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--b);transition:background .1s;cursor:pointer}
.lead-row:hover{background:var(--s2)}
.lead-row:last-child{border-bottom:none}
.lead-name{font-weight:600;font-size:13px;color:var(--ink);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lead-meta{font-family:var(--mono);font-size:10px;color:var(--ink3)}
.lead-email{font-family:var(--mono);font-size:10px;color:var(--acc)}
.lead-score{font-family:var(--mono);font-size:10px;font-weight:700;padding:2px 6px;border-radius:3px;background:var(--s3)}

/* Status chips */
.chip{font-family:var(--mono);font-size:9px;font-weight:600;padding:2px 8px;border-radius:3px;letter-spacing:.5px}
.chip-new{background:#4ECDC410;color:var(--acc);border:1px solid #4ECDC420}
.chip-sent{background:#FFB80010;color:var(--yellow);border:1px solid #FFB80020}
.chip-replied{background:#00E5A010;color:var(--green);border:1px solid #00E5A020}
.chip-bounced{background:#FF6B6B10;color:var(--red);border:1px solid #FF6B6B20}
.chip-cold{background:var(--s3);color:var(--ink3);border:1px solid var(--b)}

/* Detail panel */
.detail{position:fixed;right:0;top:0;bottom:0;width:480px;background:var(--s1);border-left:1px solid var(--b);z-index:100;overflow-y:auto;padding:20px;box-shadow:-8px 0 32px rgba(0,0,0,.4)}
.detail-close{position:absolute;top:12px;right:12px;font-size:18px;color:var(--ink3);cursor:pointer;background:none;border:none;padding:4px}

/* Email preview */
.email-box{background:var(--s2);border:1px solid var(--b);border-radius:6px;padding:14px;margin:8px 0;font-family:var(--sans);font-size:12px;line-height:1.6;color:var(--ink2)}
.email-subj{font-family:var(--mono);font-size:11px;font-weight:600;color:var(--acc);margin-bottom:8px}

/* Log */
.log{font-family:var(--mono);font-size:10px;padding:12px;background:var(--bg);border:1px solid var(--b);border-radius:6px;max-height:200px;overflow-y:auto;margin-top:12px}
.log-l{padding:2px 0;color:var(--ink3)}
.log-o{color:var(--acc)}
.log-e{color:var(--red)}
.log-w{color:var(--yellow)}

/* Inbox */
.inbox-split{display:grid;grid-template-columns:1fr 1fr;gap:12px;height:calc(100vh - 180px)}
.inbox-list{overflow-y:auto;border:1px solid var(--b);border-radius:8px;background:var(--s1)}
.inbox-detail{overflow-y:auto;border:1px solid var(--b);border-radius:8px;background:var(--s1);padding:20px}
.inbox-item{padding:12px 16px;border-bottom:1px solid var(--b);cursor:pointer;transition:background .1s}
.inbox-item:hover{background:var(--s2)}
.inbox-item.on{background:var(--s2);border-left:3px solid var(--acc)}

/* Stats bar */
.stats{display:flex;gap:1px;margin-bottom:16px;background:var(--b);border-radius:8px;overflow:hidden}
.stat{flex:1;padding:14px 16px;background:var(--s1);text-align:center}
.stat-v{font-family:var(--mono);font-size:22px;font-weight:700;color:var(--ink)}
.stat-l{font-family:var(--mono);font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--ink4);margin-top:2px}

/* Textarea */
.ta{width:100%;background:var(--s2);border:1px solid var(--b);border-radius:6px;padding:10px 12px;color:var(--ink);font-family:var(--sans);font-size:12px;resize:vertical;outline:none}
.ta:focus{border-color:var(--acc)}

/* Toast */
.toast{position:fixed;bottom:20px;right:20px;font-family:var(--mono);font-size:11px;padding:10px 16px;border-radius:6px;z-index:999;animation:fadeIn .2s}
.toast-o{background:#00E5A020;color:var(--acc2);border:1px solid #00E5A030}
.toast-e{background:#FF6B6B20;color:var(--red);border:1px solid #FF6B6B30}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
`

// ── Main Component ────────────────────────────────────────────────────────────
export default function OutreachApp(){
  const[tab,setTab]=useState<Tab>('discover')
  const[leads,setLeads]=useState<Lead[]>([])
  const[src,setSrc]=useState<Src>('coingecko')
  const[discovered,setDiscovered]=useState<Discovered[]>([])
  const[discovering,setDiscovering]=useState(false)
  const[saving,setSaving]=useState(false)
  const[detail,setDetail]=useState<Lead|null>(null)
  const[inboxLead,setInboxLead]=useState<Lead|null>(null)
  const[genning,setGenning]=useState(false)
  const[sending,setSending]=useState(false)
  const[scanning,setScanning]=useState(false)
  const[logs,setLogs]=useState<{t:LogT;m:string}[]>([])
  const[toast,setToast]=useState<{m:string;t:LogT}|null>(null)
  const[crmFilter,setCrmFilter]=useState('all')
  const[crmSearch,setCrmSearch]=useState('')
  const[replyDraft,setReplyDraft]=useState('')
  const logRef=useRef<HTMLDivElement>(null)

  const addLog=(m:string,t:LogT='i')=>{setLogs(p=>[...p,{t,m}]);setTimeout(()=>logRef.current?.scrollTo(0,9999),50)}
  const showToast=(m:string,t:LogT='o')=>{setToast({m,t});setTimeout(()=>setToast(null),3000)}

  // ── Load leads ────────────────────────────────────────────────────────────
  const loadLeads=useCallback(async()=>{
    try{
      const r=await fetch('/api/airtable').then(r=>r.json())
      if(r.ok)setLeads((r.records||[]).map(mapRecord))
    }catch{}
  },[])
  useEffect(()=>{loadLeads()},[loadLeads])

  // ── Discover ──────────────────────────────────────────────────────────────
  const discover=async()=>{
    setDiscovering(true);setDiscovered([])
    const s=SRC_DEF.find(s=>s.id===src)!
    addLog(`=== Discovering from ${s.label} ===`,'i')
    try{
      let url=SRC_ROUTES[src]
      if(src==='github'){
        const existing=leads.map(l=>{const m=(l.githubUrl||'').match(/github\.com\/([^\/\s]+)/i);return m?m[1].toLowerCase():''}).filter(Boolean)
        url+=`?queries=8&limit=60&existing=${existing.join(',')}`
      }
      const r=await fetch(url).then(r=>r.json())
      if(!r.ok)throw new Error(r.setup||r.error||'Discovery failed')
      setDiscovered(r.orgs||[])
      addLog(`✓ Found ${(r.orgs||[]).length} leads from ${s.label}`,'o')
      showToast(`${(r.orgs||[]).length} leads discovered`)
    }catch(e:any){addLog(`✗ ${e.message}`,'e');showToast(e.message,'e')}
    setDiscovering(false)
  }

  // ── Save to CRM ───────────────────────────────────────────────────────────
  const saveToCRM=async()=>{
    if(!discovered.length){showToast('Nothing to save','e');return}
    setSaving(true)
    addLog(`Saving ${discovered.length} leads to CRM...`,'i')
    let ok=0
    for(const d of discovered){
      try{
        const fields:Record<string,any>={
          'Name':d.name||d.org||'',
          'Company':d.name||d.org||'',
          'Company Type':d.type||'',
          'Website':d.website||d.url||'',
          'Lead Score':d.score||0,
          'Status':'New',
          'Sequence Status':'Cold',
          'Source':d.source||src,
          'Personalization Notes':d.description||'',
          'Notes':[d.description||'',d.symbol?`Symbol: ${d.symbol}`:'',d.marketCap?`MCap: $${(d.marketCap/1e6).toFixed(0)}M`:'',d.priceChange24h?`24h: ${d.priceChange24h>0?'+':''}${d.priceChange24h.toFixed(1)}%`:''].filter(Boolean).join('\n'),
        }
        if(d.followers)fields['Followers/Audience Size']=d.followers
        if(d.url){
          if(d.source==='x')fields['X/Twitter URL']=d.url
          else if(d.source==='linkedin')fields['LinkedIn URL']=d.url
          else if(d.source==='github')fields['GitHub Org URL']=d.url
        }
        const r=await fetch('/api/airtable',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',fields})}).then(r=>r.json())
        if(r.ok){ok++;addLog(`  ✓ ${d.name||d.org}`,'o')}
        else throw new Error(r.error)
      }catch(e:any){addLog(`  ✗ ${d.name||d.org}: ${e.message}`,'e')}
      await new Promise(r=>setTimeout(r,150))
    }
    addLog(`Saved ${ok}/${discovered.length} to CRM`,ok===discovered.length?'o':'w')
    showToast(`${ok} leads saved`)
    setDiscovered([])
    await loadLeads()
    setSaving(false)
  }

  // ── Generate sequences ────────────────────────────────────────────────────
  const generateAll=async()=>{
    const eligible=leads.filter(l=>l.contactEmail&&l.seqStatus==='Cold'&&!l.subject)
    if(!eligible.length){showToast('No leads with emails in Cold status','w');return}
    setGenning(true)
    addLog(`=== Generating sequences for ${eligible.length} leads ===`,'i')
    let ok=0
    for(const lead of eligible){
      try{
        addLog(`  Generating for ${lead.company}...`,'i')
        const r=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lead:{company:lead.company,companyType:lead.companyType,description:lead.notes,contactName:lead.contactName,jobTitle:lead.jobTitle,website:lead.website,githubOrgUrl:lead.githubUrl,notes:lead.notes}})}).then(r=>r.json())
        if(!r.ok)throw new Error(r.error)
        await fetch('/api/airtable',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'update',recordId:lead.id,fields:{'Email Subject':r.subject,'Email Body':r.body,'Follow-up 1 Subject':r.followUp1Subject||'','Follow-up 1 Body':r.followUp1Body||'','Follow-up 2 Subject':r.followUp2Subject||'','Follow-up 2 Body':r.followUp2Body||'','Status':'Sequenced','Sequence Status':'Cold'}})})
        ok++
        addLog(`  ✓ ${lead.company} — "${r.subject}"`,'o')
      }catch(e:any){addLog(`  ✗ ${lead.company}: ${e.message}`,'e')}
    }
    addLog(`Generated ${ok}/${eligible.length} sequences`,'o')
    showToast(`${ok} sequences generated`)
    await loadLeads()
    setGenning(false)
  }

  // ── Send emails ───────────────────────────────────────────────────────────
  const sendAll=async()=>{
    const ready=leads.filter(l=>l.contactEmail&&l.subject&&l.seqStatus==='Cold'&&!l.bounced)
    if(!ready.length){showToast('No sequenced leads ready to send','w');return}
    setSending(true)
    addLog(`=== Sending ${ready.length} cold emails ===`,'i')
    let ok=0
    for(const lead of ready){
      try{
        const r=await fetch('/api/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:lead.contactEmail,subject:lead.subject,body:lead.body,recordId:lead.id})}).then(r=>r.json())
        if(!r.ok)throw new Error(r.error)
        await fetch('/api/airtable',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'update',recordId:lead.id,fields:{'Status':'Sent','Sequence Status':'Email 1 Sent','Last Contacted':new Date().toISOString().split('T')[0]}})})
        ok++
        addLog(`  ✓ ${lead.company} → ${lead.contactEmail}`,'o')
      }catch(e:any){addLog(`  ✗ ${lead.company}: ${e.message}`,'e')}
      await new Promise(r=>setTimeout(r,500))
    }
    addLog(`Sent ${ok}/${ready.length} emails`,'o')
    showToast(`${ok} emails sent`)
    await loadLeads()
    setSending(false)
  }

  // ── Scan inbox ────────────────────────────────────────────────────────────
  const scanInbox=async()=>{
    setScanning(true)
    addLog('=== Scanning inbox for replies ===','i')
    try{
      const r=await fetch('/api/scan-inbox',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({days:30})}).then(r=>r.json())
      if(!r.ok)throw new Error(r.error)
      addLog(`✓ Scanned ${r.scanned} messages, found ${r.found} replies`,'o')
      showToast(`${r.found} replies found`)
      await loadLeads()
    }catch(e:any){addLog(`✗ ${e.message}`,'e');showToast(e.message,'e')}
    setScanning(false)
  }

  // ── Send reply ────────────────────────────────────────────────────────────
  const sendReply=async(lead:Lead)=>{
    if(!replyDraft.trim())return
    try{
      const r=await fetch('/api/send-reply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:lead.contactEmail,subject:`Re: ${lead.subject}`,body:replyDraft,recordId:lead.id})}).then(r=>r.json())
      if(!r.ok)throw new Error(r.error)
      showToast('Reply sent')
      setReplyDraft('')
      await loadLeads()
    }catch(e:any){showToast(e.message,'e')}
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const stats={
    total:leads.length,
    emails:leads.filter(l=>l.subject).length,
    sent:leads.filter(l=>['Email 1 Sent','Follow-up 1 Sent','Follow-up 2 Sent'].includes(l.seqStatus)).length,
    replied:leads.filter(l=>l.replyText).length,
    bounced:leads.filter(l=>l.bounced).length,
  }

  const filteredLeads=leads.filter(l=>{
    if(crmSearch){const s=crmSearch.toLowerCase();if(!l.company.toLowerCase().includes(s)&&!l.contactEmail.toLowerCase().includes(s)&&!l.source.toLowerCase().includes(s))return false}
    if(crmFilter==='all')return true
    if(crmFilter==='email')return!!l.contactEmail
    if(crmFilter==='no-email')return!l.contactEmail
    if(crmFilter==='sequenced')return!!l.subject
    if(crmFilter==='sent')return l.seqStatus.includes('Sent')
    if(crmFilter==='replied')return!!l.replyText
    return true
  })

  const repliedLeads=leads.filter(l=>l.replyText&&!l.replySent)
  const chipClass=(s:string)=>s.includes('Sent')?'chip chip-sent':s==='Replied'||s==='Booked'?'chip chip-replied':s==='Cold'?'chip chip-cold':s==='Opted Out'||s==='Bounced'?'chip chip-bounced':'chip chip-new'

  // ── Render ────────────────────────────────────────────────────────────────
  return(<>
    <style>{CSS}</style>
    <div className="app">
      {/* TOP BAR */}
      <div className="top">
        <div className="logo">
          <div className="logo-dot"/>
          <span className="logo-t">TradeCafe</span>
          <span className="logo-tag">BD Agent</span>
        </div>
        <div className="btn-row">
          <button className="btn btn-sm" onClick={loadLeads}>↻ Refresh</button>
        </div>
      </div>

      {/* NAV */}
      <div className="nav">
        {([
          {id:'discover' as Tab,label:'Discover',cnt:discovered.length||null},
          {id:'crm' as Tab,label:'CRM',cnt:leads.length||null},
          {id:'generate' as Tab,label:'Generate',cnt:stats.emails||null},
          {id:'send' as Tab,label:'Send',cnt:stats.sent||null},
          {id:'inbox' as Tab,label:'Inbox',cnt:repliedLeads.length||null},
        ]).map(n=>(
          <button key={n.id} className={`nav-btn${tab===n.id?' on':''}`} onClick={()=>setTab(n.id)}>
            {n.label}{n.cnt?<span className="nav-cnt">{n.cnt}</span>:null}
          </button>
        ))}
      </div>

      {/* STATS */}
      <div className="stats">
        <div className="stat"><div className="stat-v">{stats.total}</div><div className="stat-l">Leads</div></div>
        <div className="stat"><div className="stat-v">{stats.emails}</div><div className="stat-l">Sequenced</div></div>
        <div className="stat"><div className="stat-v">{stats.sent}</div><div className="stat-l">Sent</div></div>
        <div className="stat"><div className="stat-v">{stats.replied}</div><div className="stat-l">Replies</div></div>
        <div className="stat"><div className="stat-v" style={{color:stats.bounced?'var(--red)':'var(--ink)'}}>{stats.bounced}</div><div className="stat-l">Bounced</div></div>
      </div>

      {/* MAIN */}
      <div className="main">
        {/* ── DISCOVER TAB ────────────────────────────────────────────────── */}
        {tab==='discover'&&<>
          <div className="card">
            <div className="card-t">Lead Sources</div>
            <div className="src-grid">
              {SRC_DEF.map(s=>(
                <div key={s.id} className={`src-pill${src===s.id?' on':''}`} onClick={()=>{setSrc(s.id);setDiscovered([])}}>
                  <div className="src-top">
                    <span className="src-icon">{s.icon}</span>
                    <span className="src-label">{s.label}</span>
                    {src===s.id&&<span className="src-badge">ACTIVE</span>}
                    {s.free&&<span className="src-free">FREE</span>}
                  </div>
                  <div className="src-desc">{s.desc}</div>
                </div>
              ))}
            </div>

            {!SRC_DEF.find(s=>s.id===src)?.free&&(
              <div style={{marginBottom:12,padding:'10px 14px',background:'#FFB80008',borderRadius:6,border:'1px solid #FFB80020',fontFamily:'var(--mono)',fontSize:10,color:'var(--yellow)'}}>
                ⚠ Requires <code style={{background:'var(--s3)',padding:'1px 4px',borderRadius:3}}>{SRC_DEF.find(s=>s.id===src)?.envKey}</code> in Vercel env vars
              </div>
            )}

            <div className="btn-row">
              <button className="btn btn-acc" onClick={discover} disabled={discovering}>
                {discovering?'Searching...':'🔍 Discover'}
              </button>
              <button className="btn btn-acc" onClick={saveToCRM} disabled={saving||!discovered.length}>
                {saving?'Saving...':`↑ Save ${discovered.length} to CRM`}
              </button>
              <button className="btn btn-sm" onClick={()=>setDiscovered([])}>Clear</button>
            </div>
          </div>

          {/* Results */}
          {discovered.length>0&&(
            <div className="card">
              <div className="card-t">Discovered · {discovered.length} leads</div>
              {discovered.map((d,i)=>(
                <div key={i} className="lead-row">
                  <span className="src-icon" style={{fontSize:12}}>{SRC_DEF.find(s=>s.id===(d.source||src))?.icon||'◎'}</span>
                  <span className="lead-name">{d.name||d.org}</span>
                  <span className="lead-meta">{d.type}</span>
                  {d.score&&<span className="lead-score" style={{color:d.score>70?'var(--acc)':d.score>40?'var(--yellow)':'var(--ink3)'}}>{d.score}</span>}
                  {d.symbol&&<span className="lead-meta">{d.symbol}</span>}
                  {d.description&&<span className="lead-meta" style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.description}</span>}
                </div>
              ))}
            </div>
          )}
        </>}

        {/* ── CRM TAB ─────────────────────────────────────────────────────── */}
        {tab==='crm'&&<>
          <div className="card" style={{padding:'12px 16px'}}>
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
              <input value={crmSearch} onChange={e=>setCrmSearch(e.target.value)} placeholder="Search leads..." style={{flex:1,minWidth:200,background:'var(--s2)',border:'1px solid var(--b)',borderRadius:5,padding:'8px 12px',color:'var(--ink)',fontFamily:'var(--sans)',fontSize:12,outline:'none'}}/>
              {['all','email','no-email','sequenced','sent','replied'].map(f=>(
                <button key={f} className={`btn btn-sm${crmFilter===f?' btn-acc':''}`} onClick={()=>setCrmFilter(f)}>{f}</button>
              ))}
              <button className="btn btn-sm" onClick={loadLeads}>↻</button>
            </div>
          </div>
          <div className="card" style={{padding:0}}>
            <div style={{padding:'10px 16px',borderBottom:'1px solid var(--b)',display:'flex',gap:12,fontFamily:'var(--mono)',fontSize:10,color:'var(--ink4)',textTransform:'uppercase',letterSpacing:1}}>
              <span style={{flex:1}}>Company</span>
              <span style={{width:120}}>Source</span>
              <span style={{width:160}}>Email</span>
              <span style={{width:80}}>Status</span>
              <span style={{width:50}}>Score</span>
            </div>
            {filteredLeads.map(l=>(
              <div key={l.id} className="lead-row" onClick={()=>setDetail(l)}>
                <span className="lead-name" style={{flex:1}}>{l.company}</span>
                <span className="lead-meta" style={{width:120}}>{l.source}</span>
                <span className="lead-email" style={{width:160}}>{l.contactEmail||'—'}</span>
                <span style={{width:80}}><span className={chipClass(l.seqStatus)}>{l.seqStatus}</span></span>
                <span className="lead-score" style={{width:50}}>{l.score||'—'}</span>
              </div>
            ))}
            {!filteredLeads.length&&<div style={{padding:20,textAlign:'center',color:'var(--ink3)',fontFamily:'var(--mono)',fontSize:11}}>No leads found</div>}
          </div>
        </>}

        {/* ── GENERATE TAB ────────────────────────────────────────────────── */}
        {tab==='generate'&&<>
          <div className="card">
            <div className="card-t">Generate Email Sequences</div>
            <p style={{fontSize:12,color:'var(--ink2)',marginBottom:12,lineHeight:1.6}}>
              Claude writes personalized 3-part sequences (cold email + 2 follow-ups) for each lead with a Contact Email in Cold status. Uses TradeCafe partner revenue share pitch, crypto-native tone.
            </p>
            <div style={{marginBottom:12,fontFamily:'var(--mono)',fontSize:11,color:'var(--ink3)'}}>
              {leads.filter(l=>l.contactEmail&&l.seqStatus==='Cold'&&!l.subject).length} leads ready for sequence generation
            </div>
            <div className="btn-row">
              <button className="btn btn-acc" onClick={generateAll} disabled={genning}>
                {genning?'Generating...':'⚡ Generate All Sequences'}
              </button>
            </div>
          </div>
          {leads.filter(l=>l.subject).length>0&&(
            <div className="card">
              <div className="card-t">Sequenced Leads · {leads.filter(l=>l.subject).length}</div>
              {leads.filter(l=>l.subject).map(l=>(
                <div key={l.id} className="lead-row" onClick={()=>setDetail(l)}>
                  <span className="lead-name">{l.company}</span>
                  <span className="lead-email">{l.contactEmail}</span>
                  <span className="lead-meta" style={{maxWidth:250,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>"{l.subject}"</span>
                  <span className={chipClass(l.seqStatus)}>{l.seqStatus}</span>
                </div>
              ))}
            </div>
          )}
        </>}

        {/* ── SEND TAB ────────────────────────────────────────────────────── */}
        {tab==='send'&&<>
          <div className="card">
            <div className="card-t">Send Emails</div>
            <p style={{fontSize:12,color:'var(--ink2)',marginBottom:12,lineHeight:1.6}}>
              Sends cold emails via Gmail API from brandon@tradecafe.ai. Follow-ups fire automatically via cron (Day 5 + Day 12).
            </p>
            <div style={{marginBottom:12,fontFamily:'var(--mono)',fontSize:11,color:'var(--ink3)'}}>
              {leads.filter(l=>l.contactEmail&&l.subject&&l.seqStatus==='Cold'&&!l.bounced).length} emails ready to send
            </div>
            <div className="btn-row">
              <button className="btn btn-acc" onClick={sendAll} disabled={sending}>
                {sending?'Sending...':'📨 Send All Cold Emails'}
              </button>
            </div>
          </div>
          {leads.filter(l=>l.seqStatus.includes('Sent')).length>0&&(
            <div className="card">
              <div className="card-t">Sent · {leads.filter(l=>l.seqStatus.includes('Sent')).length}</div>
              {leads.filter(l=>l.seqStatus.includes('Sent')).map(l=>(
                <div key={l.id} className="lead-row" onClick={()=>setDetail(l)}>
                  <span className="lead-name">{l.company}</span>
                  <span className="lead-email">{l.contactEmail}</span>
                  <span className={chipClass(l.seqStatus)}>{l.seqStatus}</span>
                </div>
              ))}
            </div>
          )}
        </>}

        {/* ── INBOX TAB ───────────────────────────────────────────────────── */}
        {tab==='inbox'&&<>
          <div className="card" style={{padding:'12px 16px'}}>
            <div className="btn-row">
              <button className="btn btn-acc" onClick={scanInbox} disabled={scanning}>
                {scanning?'Scanning...':'📬 Scan Inbox for Replies'}
              </button>
              <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--ink3)'}}>
                {repliedLeads.length} replies pending response
              </span>
            </div>
          </div>
          <div className="inbox-split">
            <div className="inbox-list">
              {repliedLeads.length===0&&<div style={{padding:20,textAlign:'center',color:'var(--ink3)',fontFamily:'var(--mono)',fontSize:11}}>No replies pending</div>}
              {repliedLeads.map(l=>(
                <div key={l.id} className={`inbox-item${inboxLead?.id===l.id?' on':''}`} onClick={()=>{setInboxLead(l);setReplyDraft(l.suggestedReply||'')}}>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{l.company}</div>
                  <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--acc)',marginBottom:4}}>{l.contactEmail}</div>
                  <div style={{fontSize:11,color:'var(--ink2)',lineHeight:1.4,maxHeight:40,overflow:'hidden'}}>{l.replyText.slice(0,120)}...</div>
                  <div style={{marginTop:6}}>
                    <span className={`chip ${l.replyIntent==='interested'?'chip-replied':l.replyIntent==='unsubscribe'?'chip-bounced':'chip-sent'}`}>{l.replyIntent||'reply'}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="inbox-detail">
              {inboxLead?(
                <>
                  <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>{inboxLead.company}</div>
                  <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--acc)',marginBottom:12}}>{inboxLead.contactEmail}</div>
                  <div className="card-t" style={{fontSize:9}}>Their Reply</div>
                  <div className="email-box" style={{whiteSpace:'pre-wrap'}}>{inboxLead.replyText}</div>
                  <div className="card-t" style={{fontSize:9,marginTop:16}}>Your Response</div>
                  <textarea className="ta" rows={6} value={replyDraft} onChange={e=>setReplyDraft(e.target.value)} placeholder="Draft your reply..."/>
                  <div className="btn-row" style={{marginTop:8}}>
                    <button className="btn btn-acc" onClick={()=>sendReply(inboxLead)} disabled={!replyDraft.trim()}>Send Reply</button>
                    {inboxLead.suggestedReply&&<button className="btn btn-sm" onClick={()=>setReplyDraft(inboxLead.suggestedReply)}>Use AI Suggestion</button>}
                  </div>
                </>
              ):(
                <div style={{padding:40,textAlign:'center',color:'var(--ink4)',fontFamily:'var(--mono)',fontSize:11}}>Select a reply to respond</div>
              )}
            </div>
          </div>
        </>}

        {/* LOG */}
        {logs.length>0&&(
          <div className="log" ref={logRef}>
            {logs.map((l,i)=><div key={i} className={`log-l log-${l.t}`}>{l.m}</div>)}
          </div>
        )}
      </div>

      {/* DETAIL PANEL */}
      {detail&&(
        <div className="detail">
          <button className="detail-close" onClick={()=>setDetail(null)}>✕</button>
          <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{detail.company}</div>
          <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--ink3)',marginBottom:16}}>{detail.source} · Score: {detail.score}</div>
          {detail.contactName&&<div style={{fontSize:13,marginBottom:2}}>{detail.contactName}{detail.jobTitle?` · ${detail.jobTitle}`:''}</div>}
          {detail.contactEmail&&<div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--acc)',marginBottom:8}}>{detail.contactEmail}</div>}
          {detail.website&&<div style={{fontSize:11,marginBottom:4}}><a href={detail.website} target="_blank" rel="noopener noreferrer" style={{color:'var(--acc)'}}>↗ {detail.website}</a></div>}
          {detail.notes&&<><div className="card-t" style={{fontSize:9,marginTop:16}}>Notes</div><div style={{fontSize:12,color:'var(--ink2)',lineHeight:1.5,whiteSpace:'pre-wrap'}}>{detail.notes}</div></>}
          {detail.subject&&(
            <>
              <div className="card-t" style={{fontSize:9,marginTop:16}}>Cold Email</div>
              <div className="email-box"><div className="email-subj">{detail.subject}</div>{detail.body}</div>
              {detail.fu1Sub&&<><div className="card-t" style={{fontSize:9,marginTop:12}}>Follow-up 1</div><div className="email-box"><div className="email-subj">{detail.fu1Sub}</div>{detail.fu1Body}</div></>}
              {detail.fu2Sub&&<><div className="card-t" style={{fontSize:9,marginTop:12}}>Follow-up 2</div><div className="email-box"><div className="email-subj">{detail.fu2Sub}</div>{detail.fu2Body}</div></>}
            </>
          )}
          {detail.replyText&&<><div className="card-t" style={{fontSize:9,marginTop:16}}>Reply Received</div><div className="email-box" style={{borderColor:'#00E5A020'}}>{detail.replyText}</div><div style={{marginTop:4}}><span className={`chip ${detail.replyIntent==='interested'?'chip-replied':'chip-sent'}`}>{detail.replyIntent}</span></div></>}
          <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid var(--b)'}}>
            <div className="card-t" style={{fontSize:9}}>Status</div>
            <div style={{display:'flex',gap:6,marginTop:4}}><span className={chipClass(detail.seqStatus)}>{detail.seqStatus}</span>{detail.bounced&&<span className="chip chip-bounced">Bounced</span>}</div>
            <a href={`https://airtable.com/appCYgmFc8vTfwyv1/tblAsQXKEK9chUaT6/${detail.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm" style={{marginTop:12,display:'inline-block',textDecoration:'none'}}>↗ Open in Airtable</a>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast&&<div className={`toast toast-${toast.t}`}>{toast.m}</div>}
    </div>
  </>)
}

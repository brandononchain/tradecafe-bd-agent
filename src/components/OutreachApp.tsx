'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface KOL {
  name: string; handle: string; platform: string; niche: string
  followers: number; website: string; description: string; score: number
  source: string; email?: string; xUrl?: string; githubUrl?: string; linkedinUrl?: string
}
interface Lead {
  id: string; company: string; contactName: string; contactEmail: string
  companyType: string; website: string; status: string; seqStatus: string
  subject: string; body: string; fu1Sub: string; fu1Body: string
  fu2Sub: string; fu2Body: string; notes: string; source: string
  score: number; replyText: string; replyIntent: string
  suggestedReply: string; replySent: boolean; jobTitle: string
  followers: number; xUrl: string; linkedinUrl: string; githubUrl: string; bounced: boolean
  [k: string]: any
}
type Tab = 'discover' | 'pipeline' | 'compose' | 'send' | 'inbox'

function mapRecord(r: any): Lead {
  const f = r.fields || {}
  return {
    id: r.id, company: f['Company'] || f['Name'] || '', contactName: f['Contact Name'] || '',
    contactEmail: f['Contact Email'] || '', companyType: f['Company Type'] || '',
    website: f['Website'] || '', status: f['Status'] || 'New', seqStatus: f['Sequence Status'] || 'Cold',
    subject: f['Email Subject'] || '', body: f['Email Body'] || '',
    fu1Sub: f['Follow-up 1 Subject'] || '', fu1Body: f['Follow-up 1 Body'] || '',
    fu2Sub: f['Follow-up 2 Subject'] || '', fu2Body: f['Follow-up 2 Body'] || '',
    notes: f['Notes'] || f['Personalization Notes'] || '', source: f['Source'] || '',
    score: f['Lead Score'] || 0, replyText: f['Reply Text'] || '',
    replyIntent: f['Reply Intent'] || '', suggestedReply: f['Suggested Reply'] || '',
    replySent: !!f['Reply Sent'], jobTitle: f['Job Title'] || '',
    followers: f['Followers/Audience Size'] || 0, xUrl: f['X/Twitter URL'] || '',
    linkedinUrl: f['LinkedIn URL'] || '', githubUrl: f['GitHub Org URL'] || '', bounced: !!f['Bounced'],
  }
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'discover', label: 'Discover KOLs', icon: '◎' },
  { id: 'pipeline', label: 'Pipeline', icon: '▤' },
  { id: 'compose', label: 'Compose', icon: '✎' },
  { id: 'send', label: 'Send', icon: '↗' },
  { id: 'inbox', label: 'Inbox', icon: '◧' },
]

const SOURCES = [
  { id: 'curated', label: 'Curated KOLs', desc: 'Hand-picked crypto traders & influencers' },
  { id: 'coingecko', label: 'CoinGecko', desc: 'Trending coins → find project teams' },
  { id: 'github', label: 'GitHub', desc: 'Crypto/trading open source orgs' },
]

const TIERS = [
  { id: 'all', label: 'All Tiers' },
  { id: 'mega', label: '500K+' },
  { id: 'major', label: '200K–500K' },
  { id: 'rising', label: 'Under 200K' },
]

// ── Component ─────────────────────────────────────────────────────────────────
export default function OutreachApp() {
  const [tab, setTab] = useState<Tab>('discover')
  const [leads, setLeads] = useState<Lead[]>([])
  const [kols, setKols] = useState<KOL[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [source, setSource] = useState('curated')
  const [tier, setTier] = useState('all')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [enriching, setEnriching] = useState<string | null>(null)
  const [detail, setDetail] = useState<Lead | null>(null)
  const [inboxLead, setInboxLead] = useState<Lead | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [toast, setToast] = useState<{ m: string; t: 'ok' | 'err' | 'warn' } | null>(null)
  const [logs, setLogs] = useState<{ m: string; t: string }[]>([])
  const [manualKol, setManualKol] = useState({ name: '', handle: '', niche: '', website: '', description: '', followers: '' })
  const logRef = useRef<HTMLDivElement>(null)

  const showToast = (m: string, t: 'ok' | 'err' | 'warn' = 'ok') => {
    setToast({ m, t })
    setTimeout(() => setToast(null), 3500)
  }
  const log = (m: string, t = 'i') => setLogs(p => [...p.slice(-80), { m: `[${new Date().toLocaleTimeString()}] ${m}`, t }])

  // ── Load CRM ─────────────────────────────────────────────────────────────
  const loadLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/airtable')
      const data = await res.json()
      if (data.ok) {
        const mapped = (data.records || []).map(mapRecord)
        setLeads(mapped)
        log(`CRM loaded: ${mapped.length} leads`)
      }
    } catch (e: any) { log(`CRM error: ${e.message}`, 'e') }
  }, [])

  useEffect(() => { loadLeads() }, [loadLeads])

  // ── Discover KOLs ────────────────────────────────────────────────────────
  const discover = async () => {
    setLoading(true)
    setKols([])
    log(`Discovering KOLs from ${source}...`)
    try {
      const res = await fetch(`/api/discover-kols?source=${source}&tier=${tier}`)
      const data = await res.json()
      if (data.ok) {
        setKols(data.kols || [])
        log(`Found ${data.total} KOLs`, 'o')
      } else {
        log(`Discovery failed: ${data.error}`, 'e')
        showToast(data.error || 'Discovery failed', 'err')
      }
    } catch (e: any) {
      log(`Error: ${e.message}`, 'e')
      showToast(e.message, 'err')
    }
    setLoading(false)
  }

  // ── Save KOLs to CRM ────────────────────────────────────────────────────
  const saveToCRM = async () => {
    const toSave = kols.filter(k => selected.has(k.handle))
    if (!toSave.length) { showToast('Select KOLs to save first', 'warn'); return }
    setSaving(true)
    log(`Saving ${toSave.length} KOLs to CRM...`)
    let ok = 0
    for (const k of toSave) {
      try {
        const fields: Record<string, any> = {
          'Company': k.name,
          'Contact Name': k.name,
          'Company Type': k.niche,
          'Website': k.website || '',
          'Source': `BD Agent — ${k.source}`,
          'Lead Score': k.score,
          'Status': 'New',
          'Sequence Status': 'Cold',
          'Notes': k.description,
          'Followers/Audience Size': k.followers,
        }
        if (k.xUrl) fields['X/Twitter URL'] = k.xUrl
        if (k.githubUrl) fields['GitHub Org URL'] = k.githubUrl
        if (k.email) fields['Contact Email'] = k.email

        const res = await fetch('/api/airtable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create', fields }),
        })
        const data = await res.json()
        if (data.ok) {
          ok++
          log(`✓ Saved ${k.name}`, 'o')
        } else {
          log(`✗ ${k.name}: ${data.error}`, 'e')
        }
      } catch (e: any) {
        log(`✗ ${k.name}: ${e.message}`, 'e')
      }
    }
    showToast(`Saved ${ok}/${toSave.length} KOLs to CRM`, ok > 0 ? 'ok' : 'err')
    setSelected(new Set())
    await loadLeads()
    setSaving(false)
  }

  // ── Add manual KOL ──────────────────────────────────────────────────────
  const addManualKol = async () => {
    if (!manualKol.name) { showToast('Name is required', 'warn'); return }
    setSaving(true)
    try {
      const fields: Record<string, any> = {
        'Company': manualKol.name,
        'Contact Name': manualKol.name,
        'Company Type': manualKol.niche || 'Crypto KOL',
        'Website': manualKol.website || '',
        'Source': 'BD Agent — Manual',
        'Lead Score': 50,
        'Status': 'New',
        'Sequence Status': 'Cold',
        'Notes': manualKol.description || '',
        'Followers/Audience Size': parseInt(manualKol.followers) || 0,
      }
      if (manualKol.handle) {
        const clean = manualKol.handle.replace('@', '')
        fields['X/Twitter URL'] = `https://x.com/${clean}`
      }
      const res = await fetch('/api/airtable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', fields }),
      })
      const data = await res.json()
      if (data.ok) {
        showToast(`Added ${manualKol.name} to CRM`, 'ok')
        setManualKol({ name: '', handle: '', niche: '', website: '', description: '', followers: '' })
        await loadLeads()
      } else { showToast(data.error, 'err') }
    } catch (e: any) { showToast(e.message, 'err') }
    setSaving(false)
  }

  // ── Enrich lead (find email) ────────────────────────────────────────────
  const enrichLead = async (lead: Lead) => {
    setEnriching(lead.id)
    log(`Enriching ${lead.company}...`)
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId: lead.id,
          company: lead.company,
          website: lead.website,
          xHandle: lead.xUrl ? lead.xUrl.split('/').pop() : '',
          githubOrg: lead.githubUrl ? lead.githubUrl.split('/').pop() : '',
          contactName: lead.contactName,
          linkedinUrl: lead.linkedinUrl,
        }),
      })
      const data = await res.json()
      if (data.ok && data.found) {
        log(`✓ Found: ${data.bestEmail} (via ${data.bestSource})`, 'o')
        showToast(`Found email for ${lead.company}`, 'ok')
        await loadLeads()
      } else if (data.ok && data.website) {
        log(`⚡ Found website (${data.website}) for ${lead.company} but no email`, 'w')
        showToast(data.apolloConfigured
          ? 'Found website but no email in Apollo — KOL may not have public email'
          : 'Found website but no email — set APOLLO_API_KEY in Vercel env', 'warn')
        await loadLeads()
      } else {
        log(`✗ No email found for ${lead.company} (${data.totalFound || 0} sources checked)`, 'w')
        showToast(data.apolloConfigured
          ? 'No email found — KOL may not have public email'
          : 'No email found — set APOLLO_API_KEY for better results', 'warn')
      }
    } catch (e: any) { log(`Enrich error: ${e.message}`, 'e') }
    setEnriching(null)
  }

  // ── Generate email sequences ────────────────────────────────────────────
  const generateEmails = async () => {
    const targets = leads.filter(l => l.seqStatus === 'Cold' && !l.subject)
    if (!targets.length) { showToast('No cold leads without emails to generate for', 'warn'); return }
    setGenerating(true)
    log(`Generating email sequences for ${targets.length} leads...`)
    let ok = 0
    for (const lead of targets) {
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead, senderName: 'Brandon @ TradeCafe', mode: 'all' }),
        })
        const data = await res.json()
        if (data.ok) {
          // Save to CRM
          await fetch('/api/airtable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'update',
              recordId: lead.id,
              fields: {
                'Email Subject': data.subject,
                'Email Body': data.body,
                'Follow-up 1 Subject': data.followUp1Subject || '',
                'Follow-up 1 Body': data.followUp1Body || '',
                'Follow-up 2 Subject': data.followUp2Subject || '',
                'Follow-up 2 Body': data.followUp2Body || '',
                'Status': 'Sequenced',
              },
            }),
          })
          ok++
          log(`✓ ${lead.company}: "${data.subject}"`, 'o')
        } else { log(`✗ ${lead.company}: ${data.error}`, 'e') }
      } catch (e: any) { log(`✗ ${lead.company}: ${e.message}`, 'e') }
    }
    showToast(`Generated ${ok}/${targets.length} sequences`, ok > 0 ? 'ok' : 'err')
    await loadLeads()
    setGenerating(false)
  }

  // ── Send emails ─────────────────────────────────────────────────────────
  const sendAll = async () => {
    const ready = leads.filter(l => l.contactEmail && l.subject && l.seqStatus === 'Cold' && !l.bounced)
    if (!ready.length) { showToast('No emails ready to send', 'warn'); return }
    setSending(true)
    log(`Sending ${ready.length} cold emails...`)
    let ok = 0
    for (const lead of ready) {
      try {
        const res = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: lead.contactEmail, subject: lead.subject, body: lead.body, recordId: lead.id }),
        })
        const data = await res.json()
        if (data.ok) {
          await fetch('/api/airtable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update', recordId: lead.id, fields: { 'Sequence Status': 'Email 1 Sent', 'Status': 'Sent' } }),
          })
          ok++
          log(`✓ Sent to ${lead.contactEmail}`, 'o')
        } else {
          log(`✗ ${lead.contactEmail}: ${data.error}`, 'e')
          if (data.bounced) log(`  ↳ Bounced — marked in CRM`, 'w')
        }
      } catch (e: any) { log(`✗ ${lead.contactEmail}: ${e.message}`, 'e') }
    }
    showToast(`Sent ${ok}/${ready.length} emails`, ok > 0 ? 'ok' : 'err')
    await loadLeads()
    setSending(false)
  }

  // ── Scan inbox ──────────────────────────────────────────────────────────
  const scanInbox = async () => {
    setScanning(true)
    log('Scanning inbox for replies...')
    try {
      const res = await fetch('/api/scan-inbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
      if (data.ok) {
        log(`Found ${data.matched || 0} replies`, 'o')
        await loadLeads()
      } else { log(`Scan error: ${data.error}`, 'e') }
    } catch (e: any) { log(`Error: ${e.message}`, 'e') }
    setScanning(false)
  }

  // ── Send reply ──────────────────────────────────────────────────────────
  const sendReply = async (lead: Lead) => {
    if (!replyDraft.trim()) return
    try {
      const res = await fetch('/api/send-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: lead.contactEmail, subject: `Re: ${lead.subject}`, body: replyDraft, recordId: lead.id }),
      })
      const data = await res.json()
      if (data.ok) {
        showToast('Reply sent', 'ok')
        setReplyDraft('')
        await loadLeads()
      } else { showToast(data.error || 'Send failed', 'err') }
    } catch (e: any) { showToast(e.message, 'err') }
  }

  // ── Toggle selection ────────────────────────────────────────────────────
  const toggleSelect = (handle: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(handle) ? next.delete(handle) : next.add(handle)
      return next
    })
  }
  const selectAll = () => {
    if (selected.size === kols.length) setSelected(new Set())
    else setSelected(new Set(kols.map(k => k.handle)))
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const coldLeads = leads.filter(l => l.seqStatus === 'Cold')
  const needsEmail = leads.filter(l => !l.contactEmail && l.seqStatus === 'Cold')
  const readyToGenerate = leads.filter(l => l.seqStatus === 'Cold' && !l.subject)
  const readyToSend = leads.filter(l => l.contactEmail && l.subject && l.seqStatus === 'Cold' && !l.bounced)
  const sentLeads = leads.filter(l => l.seqStatus.includes('Sent'))
  const repliedLeads = leads.filter(l => l.replyText && !l.replySent)
  const chipClass = (s: string) => `chip chip-${s === 'Cold' ? 'cold' : s.includes('Sent') ? 'sent' : s === 'Replied' ? 'replied' : 'cold'}`

  return (<>
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
:root {
  --bg: #060609; --s1: #0c0c12; --s2: #111118; --s3: #17171f; --s4: #1d1d27;
  --b: rgba(255,255,255,0.06); --b2: rgba(255,255,255,0.1); --b3: rgba(255,255,255,0.15);
  --ink: #e2e4e9; --ink2: #a0a4b0; --ink3: #6b7080; --ink4: #454858;
  --acc: #4ECDC4; --acc2: #00E5A0; --acc3: #7B61FF;
  --red: #FF6B6B; --yellow: #FFB800; --green: #00E5A0;
  --mono: 'JetBrains Mono', monospace; --sans: 'Inter', sans-serif;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); font-family: var(--sans); font-size: 13px; -webkit-font-smoothing: antialiased; }
::selection { background: #4ECDC420; }
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--b2); border-radius: 2px; }

.app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.top { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; border-bottom: 1px solid var(--b); background: var(--s1); }
.logo { display: flex; align-items: center; gap: 8px; }
.logo-img { width: 28px; height: 28px; border-radius: 6px; object-fit: cover; }
.logo-t { font-family: var(--mono); font-size: 14px; font-weight: 700; letter-spacing: 1px; }
.logo-tag { font-family: var(--mono); font-size: 9px; font-weight: 700; letter-spacing: 1.5px; padding: 2px 8px; border-radius: 3px; background: var(--acc); color: var(--bg); text-transform: uppercase; }

.nav { display: flex; border-bottom: 1px solid var(--b); background: var(--s1); overflow-x: auto; }
.nav-btn { font-family: var(--mono); font-size: 10px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; padding: 12px 20px; border: none; background: none; color: var(--ink3); cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; transition: all .15s; display: flex; align-items: center; gap: 6px; }
.nav-btn:hover { color: var(--ink2); }
.nav-btn.on { color: var(--acc); border-bottom-color: var(--acc); }
.nav-cnt { font-family: var(--mono); font-size: 9px; padding: 1px 6px; border-radius: 3px; background: var(--s3); color: var(--ink3); }

.main { flex: 1; overflow-y: auto; padding: 20px; }
.card { background: var(--s1); border: 1px solid var(--b); border-radius: 8px; padding: 16px 20px; margin-bottom: 12px; }
.card-t { font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--ink2); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
.card-t::before { content: ''; width: 3px; height: 12px; background: linear-gradient(180deg, var(--acc), var(--acc3)); border-radius: 2px; }

.src-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.src-pill { padding: 8px 14px; border-radius: 6px; border: 1px solid var(--b); background: var(--s2); cursor: pointer; transition: all .12s; font-family: var(--mono); font-size: 11px; }
.src-pill:hover { border-color: var(--b2); background: var(--s3); }
.src-pill.on { border-color: var(--acc); background: #4ECDC408; color: var(--acc); }
.src-desc { font-size: 10px; color: var(--ink4); margin-top: 2px; }

.btn { font-family: var(--mono); font-size: 11px; font-weight: 600; padding: 8px 16px; border-radius: 5px; border: 1px solid var(--b); background: var(--s2); color: var(--ink2); cursor: pointer; transition: all .12s; letter-spacing: .5px; }
.btn:hover:not(:disabled) { background: var(--s3); border-color: var(--b2); color: var(--ink); }
.btn:disabled { opacity: .35; cursor: not-allowed; }
.btn-acc { background: var(--acc); color: var(--bg); border-color: var(--acc); font-weight: 700; }
.btn-acc:hover:not(:disabled) { background: var(--acc2); }
.btn-sm { font-size: 10px; padding: 5px 10px; }
.btn-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }

.kol-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--b); transition: background .1s; }
.kol-row:hover { background: var(--s2); }
.kol-cb { width: 16px; height: 16px; border-radius: 3px; border: 1px solid var(--b2); cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all .1s; }
.kol-cb.on { background: var(--acc); border-color: var(--acc); }
.kol-name { font-weight: 600; font-size: 13px; min-width: 140px; }
.kol-handle { font-family: var(--mono); font-size: 11px; color: var(--acc); min-width: 130px; }
.kol-niche { font-size: 11px; color: var(--ink2); min-width: 150px; }
.kol-followers { font-family: var(--mono); font-size: 11px; color: var(--ink3); min-width: 80px; text-align: right; }
.kol-score { font-family: var(--mono); font-size: 10px; padding: 2px 8px; border-radius: 3px; min-width: 40px; text-align: center; }
.kol-score.high { background: #00E5A015; color: var(--green); }
.kol-score.med { background: #FFB80015; color: var(--yellow); }
.kol-score.low { background: #FF6B6B15; color: var(--red); }

.lead-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--b); cursor: pointer; transition: background .1s; }
.lead-row:hover { background: var(--s2); }
.lead-name { font-weight: 600; font-size: 13px; min-width: 140px; }
.lead-email { font-family: var(--mono); font-size: 11px; color: var(--acc); min-width: 180px; }

.chip { font-family: var(--mono); font-size: 9px; font-weight: 600; padding: 2px 8px; border-radius: 3px; text-transform: uppercase; letter-spacing: .5px; }
.chip-cold { background: var(--s3); color: var(--ink3); }
.chip-sent { background: #7B61FF15; color: var(--acc3); }
.chip-replied { background: #00E5A015; color: var(--green); }
.chip-bounced { background: #FF6B6B15; color: var(--red); }

.input { font-family: var(--mono); font-size: 12px; padding: 8px 12px; border-radius: 5px; border: 1px solid var(--b); background: var(--s2); color: var(--ink); width: 100%; outline: none; }
.input:focus { border-color: var(--acc); }
.input-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }

.ta { font-family: var(--mono); font-size: 12px; padding: 10px 12px; border-radius: 5px; border: 1px solid var(--b); background: var(--s2); color: var(--ink); width: 100%; outline: none; resize: vertical; line-height: 1.6; }
.ta:focus { border-color: var(--acc); }

.email-box { background: var(--s2); border: 1px solid var(--b); border-radius: 6px; padding: 12px 14px; font-size: 12px; line-height: 1.6; color: var(--ink2); white-space: pre-wrap; margin-bottom: 8px; }
.email-subj { font-weight: 600; color: var(--ink); margin-bottom: 6px; font-size: 13px; }

.detail { position: fixed; right: 0; top: 0; width: 420px; height: 100vh; background: var(--s1); border-left: 1px solid var(--b); padding: 20px; overflow-y: auto; z-index: 50; }
.detail-close { position: absolute; top: 12px; right: 12px; background: none; border: none; color: var(--ink3); cursor: pointer; font-size: 16px; }

.inbox-split { display: grid; grid-template-columns: 320px 1fr; gap: 0; border: 1px solid var(--b); border-radius: 8px; overflow: hidden; min-height: 400px; }
.inbox-list { background: var(--s1); border-right: 1px solid var(--b); overflow-y: auto; }
.inbox-item { padding: 12px 14px; border-bottom: 1px solid var(--b); cursor: pointer; transition: background .1s; }
.inbox-item:hover { background: var(--s2); }
.inbox-item.on { background: var(--s2); border-left: 2px solid var(--acc); }
.inbox-detail { background: var(--s2); padding: 20px; overflow-y: auto; }

.log { background: var(--bg); border: 1px solid var(--b); border-radius: 6px; padding: 8px 12px; margin-top: 16px; max-height: 160px; overflow-y: auto; font-family: var(--mono); font-size: 10px; line-height: 1.8; }
.log-i { color: var(--ink3); } .log-o { color: var(--green); } .log-e { color: var(--red); } .log-w { color: var(--yellow); }

.toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 10px 24px; border-radius: 6px; font-family: var(--mono); font-size: 11px; font-weight: 600; z-index: 100; animation: fadeIn .2s; }
.toast-ok { background: var(--green); color: var(--bg); } .toast-err { background: var(--red); color: #fff; } .toast-warn { background: var(--yellow); color: var(--bg); }
@keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } }

.stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-bottom: 16px; }
.stat { background: var(--s2); border: 1px solid var(--b); border-radius: 6px; padding: 12px 14px; }
.stat-label { font-family: var(--mono); font-size: 9px; color: var(--ink3); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
.stat-val { font-family: var(--mono); font-size: 20px; font-weight: 700; }
    `}</style>

    <div className="app">
      {/* TOP BAR */}
      <div className="top">
        <div className="logo">
          <img src="/tradecafe-logo.jpg" alt="TradeCafe" className="logo-img" />
          <span className="logo-t">TRADECAFE</span>
          <span className="logo-tag">BD Agent</span>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink3)' }}>
          {leads.length} leads · {leads.filter(l => l.contactEmail).length} enriched · {sentLeads.length} sent
        </div>
      </div>

      {/* NAV */}
      <div className="nav">
        {TABS.map(t => (
          <button key={t.id} className={`nav-btn${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
            <span>{t.icon}</span> {t.label}
            {t.id === 'pipeline' && leads.length > 0 && <span className="nav-cnt">{leads.length}</span>}
            {t.id === 'inbox' && repliedLeads.length > 0 && <span className="nav-cnt">{repliedLeads.length}</span>}
          </button>
        ))}
      </div>

      {/* MAIN CONTENT */}
      <div className="main">

        {/* ── DISCOVER TAB ──────────────────────────────────────────────── */}
        {tab === 'discover' && <>
          <div className="card">
            <div className="card-t">Source</div>
            <div className="src-row">
              {SOURCES.map(s => (
                <div key={s.id} className={`src-pill${source === s.id ? ' on' : ''}`} onClick={() => setSource(s.id)}>
                  {s.label}
                  <div className="src-desc">{s.desc}</div>
                </div>
              ))}
            </div>
            <div className="src-row" style={{ marginBottom: 0 }}>
              {TIERS.map(t => (
                <div key={t.id} className={`src-pill${tier === t.id ? ' on' : ''}`} onClick={() => setTier(t.id)} style={{ padding: '6px 12px' }}>
                  {t.label}
                </div>
              ))}
              <button className="btn btn-acc" onClick={discover} disabled={loading} style={{ marginLeft: 'auto' }}>
                {loading ? 'Scanning...' : '◎ Discover'}
              </button>
            </div>
          </div>

          {/* Results */}
          {kols.length > 0 && (
            <div className="card" style={{ padding: '12px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', marginBottom: 8 }}>
                <div className="card-t" style={{ marginBottom: 0 }}>{kols.length} KOLs Found</div>
                <div className="btn-row">
                  <button className="btn btn-sm" onClick={selectAll}>
                    {selected.size === kols.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <button className="btn btn-sm btn-acc" onClick={saveToCRM} disabled={saving || selected.size === 0}>
                    {saving ? 'Saving...' : `Save ${selected.size} to CRM`}
                  </button>
                </div>
              </div>
              {kols.map(k => (
                <div key={k.handle} className="kol-row">
                  <div className={`kol-cb${selected.has(k.handle) ? ' on' : ''}`} onClick={() => toggleSelect(k.handle)}>
                    {selected.has(k.handle) && <span style={{ fontSize: 10, color: 'var(--bg)' }}>✓</span>}
                  </div>
                  <span className="kol-name">{k.name}</span>
                  <a href={k.xUrl || k.website || '#'} target="_blank" rel="noopener noreferrer" className="kol-handle" style={{ textDecoration: 'none' }}>
                    {k.handle}
                  </a>
                  <span className="kol-niche">{k.niche}</span>
                  <span className="kol-followers">
                    {k.followers >= 1000000 ? `${(k.followers / 1000000).toFixed(1)}M` : k.followers >= 1000 ? `${(k.followers / 1000).toFixed(0)}K` : k.followers}
                  </span>
                  <span className={`kol-score ${k.score >= 70 ? 'high' : k.score >= 40 ? 'med' : 'low'}`}>{k.score}</span>
                </div>
              ))}
            </div>
          )}

          {/* Manual add */}
          <div className="card">
            <div className="card-t">Add KOL Manually</div>
            <div className="input-row">
              <input className="input" placeholder="Name *" value={manualKol.name} onChange={e => setManualKol(p => ({ ...p, name: e.target.value }))} />
              <input className="input" placeholder="X Handle (e.g. @trader)" value={manualKol.handle} onChange={e => setManualKol(p => ({ ...p, handle: e.target.value }))} />
            </div>
            <div className="input-row">
              <input className="input" placeholder="Niche (e.g. Swing Trading)" value={manualKol.niche} onChange={e => setManualKol(p => ({ ...p, niche: e.target.value }))} />
              <input className="input" placeholder="Website" value={manualKol.website} onChange={e => setManualKol(p => ({ ...p, website: e.target.value }))} />
            </div>
            <div className="input-row">
              <input className="input" placeholder="Followers (number)" value={manualKol.followers} onChange={e => setManualKol(p => ({ ...p, followers: e.target.value }))} />
              <input className="input" placeholder="Notes / Description" value={manualKol.description} onChange={e => setManualKol(p => ({ ...p, description: e.target.value }))} />
            </div>
            <button className="btn btn-acc" onClick={addManualKol} disabled={saving || !manualKol.name}>
              {saving ? 'Adding...' : '+ Add to CRM'}
            </button>
          </div>
        </>}

        {/* ── PIPELINE TAB ──────────────────────────────────────────────── */}
        {tab === 'pipeline' && <>
          <div className="stat-row">
            <div className="stat"><div className="stat-label">Total Leads</div><div className="stat-val">{leads.length}</div></div>
            <div className="stat"><div className="stat-label">Cold</div><div className="stat-val" style={{ color: 'var(--ink3)' }}>{coldLeads.length}</div></div>
            <div className="stat"><div className="stat-label">Need Email</div><div className="stat-val" style={{ color: 'var(--yellow)' }}>{needsEmail.length}</div></div>
            <div className="stat"><div className="stat-label">Sent</div><div className="stat-val" style={{ color: 'var(--acc3)' }}>{sentLeads.length}</div></div>
            <div className="stat"><div className="stat-label">Replied</div><div className="stat-val" style={{ color: 'var(--green)' }}>{repliedLeads.length}</div></div>
          </div>

          {leads.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)' }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>No leads yet</div>
              <div style={{ fontSize: 11 }}>Go to Discover KOLs to find and save targets</div>
            </div>
          ) : (
            <div className="card" style={{ padding: '12px 0' }}>
              <div style={{ padding: '0 16px', marginBottom: 8 }}>
                <div className="card-t" style={{ marginBottom: 0 }}>All Leads</div>
              </div>
              {leads.map(l => (
                <div key={l.id} className="lead-row" onClick={() => setDetail(l)}>
                  <span className="lead-name">{l.company}</span>
                  <span className="lead-email">{l.contactEmail || <span style={{ color: 'var(--yellow)', fontSize: 10 }}>No email</span>}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink3)', minWidth: 100 }}>{l.source.replace('BD Agent — ', '')}</span>
                  <span className={chipClass(l.seqStatus)}>{l.seqStatus}</span>
                  {!l.contactEmail && (
                    <button className="btn btn-sm" onClick={e => { e.stopPropagation(); enrichLead(l) }} disabled={enriching === l.id} style={{ marginLeft: 'auto' }}>
                      {enriching === l.id ? '...' : '⚡ Enrich'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>}

        {/* ── COMPOSE TAB ───────────────────────────────────────────────── */}
        {tab === 'compose' && <>
          <div className="card">
            <div className="card-t">Generate Email Sequences</div>
            <p style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 12, lineHeight: 1.6 }}>
              Claude generates a personalized 3-part email sequence (cold + 2 follow-ups) for each lead. Sequences are tailored to the KOL's niche, platform, and audience using the TradeCafe partner pitch.
            </p>
            <div className="stat-row" style={{ marginBottom: 12 }}>
              <div className="stat"><div className="stat-label">Needs Sequence</div><div className="stat-val">{readyToGenerate.length}</div></div>
              <div className="stat"><div className="stat-label">Already Generated</div><div className="stat-val">{leads.filter(l => l.subject).length}</div></div>
            </div>
            <button className="btn btn-acc" onClick={generateEmails} disabled={generating || readyToGenerate.length === 0}>
              {generating ? 'Generating...' : `✎ Generate for ${readyToGenerate.length} Leads`}
            </button>
          </div>

          {/* Preview generated sequences */}
          {leads.filter(l => l.subject).length > 0 && (
            <div className="card" style={{ padding: '12px 0' }}>
              <div style={{ padding: '0 16px' }}><div className="card-t">Generated Sequences</div></div>
              {leads.filter(l => l.subject).map(l => (
                <div key={l.id} className="lead-row" onClick={() => setDetail(l)}>
                  <span className="lead-name">{l.company}</span>
                  <span className="lead-email">{l.contactEmail}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink2)', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{l.subject}"</span>
                  <span className={chipClass(l.seqStatus)}>{l.seqStatus}</span>
                </div>
              ))}
            </div>
          )}
        </>}

        {/* ── SEND TAB ──────────────────────────────────────────────────── */}
        {tab === 'send' && <>
          <div className="card">
            <div className="card-t">Send Emails</div>
            <p style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 12, lineHeight: 1.6 }}>
              Sends cold emails via Gmail API from brandon@tradecafe.ai. Follow-ups fire automatically via cron (Day 5 + Day 12).
            </p>
            <div style={{ marginBottom: 12, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink3)' }}>
              {readyToSend.length} emails ready to send
            </div>
            <button className="btn btn-acc" onClick={sendAll} disabled={sending || readyToSend.length === 0}>
              {sending ? 'Sending...' : `↗ Send ${readyToSend.length} Cold Emails`}
            </button>
          </div>
          {sentLeads.length > 0 && (
            <div className="card" style={{ padding: '12px 0' }}>
              <div style={{ padding: '0 16px' }}><div className="card-t">Sent · {sentLeads.length}</div></div>
              {sentLeads.map(l => (
                <div key={l.id} className="lead-row" onClick={() => setDetail(l)}>
                  <span className="lead-name">{l.company}</span>
                  <span className="lead-email">{l.contactEmail}</span>
                  <span className={chipClass(l.seqStatus)}>{l.seqStatus}</span>
                </div>
              ))}
            </div>
          )}
        </>}

        {/* ── INBOX TAB ─────────────────────────────────────────────────── */}
        {tab === 'inbox' && <>
          <div className="card" style={{ padding: '12px 16px' }}>
            <div className="btn-row">
              <button className="btn btn-acc" onClick={scanInbox} disabled={scanning}>
                {scanning ? 'Scanning...' : '◧ Scan Inbox for Replies'}
              </button>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink3)' }}>
                {repliedLeads.length} replies pending
              </span>
            </div>
          </div>
          {repliedLeads.length > 0 ? (
            <div className="inbox-split">
              <div className="inbox-list">
                {repliedLeads.map(l => (
                  <div key={l.id} className={`inbox-item${inboxLead?.id === l.id ? ' on' : ''}`} onClick={() => { setInboxLead(l); setReplyDraft(l.suggestedReply || '') }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{l.company}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--acc)', marginBottom: 4 }}>{l.contactEmail}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink2)', lineHeight: 1.4, maxHeight: 40, overflow: 'hidden' }}>{l.replyText.slice(0, 120)}...</div>
                  </div>
                ))}
              </div>
              <div className="inbox-detail">
                {inboxLead ? (<>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{inboxLead.company}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--acc)', marginBottom: 12 }}>{inboxLead.contactEmail}</div>
                  <div className="card-t" style={{ fontSize: 9 }}>Their Reply</div>
                  <div className="email-box" style={{ whiteSpace: 'pre-wrap' }}>{inboxLead.replyText}</div>
                  <div className="card-t" style={{ fontSize: 9, marginTop: 16 }}>Your Response</div>
                  <textarea className="ta" rows={6} value={replyDraft} onChange={e => setReplyDraft(e.target.value)} placeholder="Draft your reply..." />
                  <div className="btn-row" style={{ marginTop: 8 }}>
                    <button className="btn btn-acc" onClick={() => sendReply(inboxLead)} disabled={!replyDraft.trim()}>Send Reply</button>
                    {inboxLead.suggestedReply && <button className="btn btn-sm" onClick={() => setReplyDraft(inboxLead.suggestedReply)}>Use AI Suggestion</button>}
                  </div>
                </>) : (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink4)', fontFamily: 'var(--mono)', fontSize: 11 }}>Select a reply to respond</div>
                )}
              </div>
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)' }}>
              <div style={{ fontSize: 11 }}>No replies yet. Scan inbox after sending emails.</div>
            </div>
          )}
        </>}

        {/* LOG */}
        {logs.length > 0 && (
          <div className="log" ref={logRef}>
            {logs.map((l, i) => <div key={i} className={`log-l log-${l.t}`}>{l.m}</div>)}
          </div>
        )}
      </div>

      {/* DETAIL PANEL */}
      {detail && (
        <div className="detail">
          <button className="detail-close" onClick={() => setDetail(null)}>✕</button>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{detail.company}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink3)', marginBottom: 16 }}>{detail.source} · Score: {detail.score}</div>
          {detail.contactName && <div style={{ fontSize: 13, marginBottom: 2 }}>{detail.contactName}{detail.jobTitle ? ` · ${detail.jobTitle}` : ''}</div>}
          {detail.contactEmail && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--acc)', marginBottom: 8 }}>{detail.contactEmail}</div>}
          {detail.website && <div style={{ fontSize: 11, marginBottom: 4 }}><a href={detail.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--acc)' }}>↗ {detail.website}</a></div>}
          {detail.xUrl && <div style={{ fontSize: 11, marginBottom: 4 }}><a href={detail.xUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--acc)' }}>↗ {detail.xUrl}</a></div>}
          {detail.notes && <><div className="card-t" style={{ fontSize: 9, marginTop: 16 }}>Notes</div><div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{detail.notes}</div></>}

          {/* Enrich button */}
          {!detail.contactEmail && (
            <button className="btn btn-sm btn-acc" style={{ marginTop: 12 }} onClick={() => enrichLead(detail)} disabled={enriching === detail.id}>
              {enriching === detail.id ? 'Enriching...' : '⚡ Find Email'}
            </button>
          )}

          {/* Email preview */}
          {detail.subject && (<>
            <div className="card-t" style={{ fontSize: 9, marginTop: 16 }}>Cold Email</div>
            <div className="email-box"><div className="email-subj">{detail.subject}</div>{detail.body}</div>
            {detail.fu1Sub && <><div className="card-t" style={{ fontSize: 9, marginTop: 12 }}>Follow-up 1</div><div className="email-box"><div className="email-subj">{detail.fu1Sub}</div>{detail.fu1Body}</div></>}
            {detail.fu2Sub && <><div className="card-t" style={{ fontSize: 9, marginTop: 12 }}>Follow-up 2</div><div className="email-box"><div className="email-subj">{detail.fu2Sub}</div>{detail.fu2Body}</div></>}
          </>)}

          {/* Reply */}
          {detail.replyText && <><div className="card-t" style={{ fontSize: 9, marginTop: 16 }}>Reply Received</div><div className="email-box" style={{ borderColor: '#00E5A020' }}>{detail.replyText}</div></>}

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--b)' }}>
            <div className="card-t" style={{ fontSize: 9 }}>Status</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <span className={chipClass(detail.seqStatus)}>{detail.seqStatus}</span>
              {detail.bounced && <span className="chip chip-bounced">Bounced</span>}
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && <div className={`toast toast-${toast.t}`}>{toast.m}</div>}
    </div>
  </>)
}

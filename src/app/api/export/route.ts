import { NextRequest, NextResponse } from 'next/server'

const BASE  = 'appCYgmFc8vTfwyv1'
const TABLE = 'tblAsQXKEK9chUaT6'
const AT    = () => process.env.AIRTABLE_API_KEY!

// Professional CSV escaping
function cell(v: any): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object' && 'name' in v) return csvStr(v.name)
  return csvStr(String(v))
}
function csvStr(s: string): string {
  if (!s) return ''
  // Always quote if contains comma, quote, newline, or leading/trailing space
  const needsQuote = /[",\n\r]/.test(s) || s !== s.trim()
  const escaped    = s.replace(/"/g, '""')
  return needsQuote ? `"${escaped}"` : escaped
}

function formatDate(d: string): string {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('en-US', {year:'numeric',month:'short',day:'numeric'})
  } catch { return d }
}

function yesNo(v: any): string {
  if (!v) return ''
  return v === true || v === 1 ? 'Yes' : ''
}

export async function GET(req: NextRequest) {
  const sp     = new URL(req.url).searchParams
  const filter = sp.get('filter') || 'all'

  try {
    // Load all records with pagination
    let records: any[] = []
    let offset: string | undefined

    do {
      const params = new URLSearchParams({ pageSize: '100' })
      if (offset) params.set('offset', offset)
      const r = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}?${params}`, {
        headers: { Authorization: `Bearer ${AT()}` },
      })
      if (!r.ok) throw new Error(`Airtable ${r.status}`)
      const d = await r.json()
      records.push(...(d.records || []))
      offset = d.offset
    } while (offset)

    // Apply filter
    if (filter !== 'all') {
      records = records.filter(r => {
        const f    = r.fields
        const stat = typeof f['Status'] === 'object' ? f['Status']?.name : f['Status'] || ''
        const seq  = typeof f['Sequence Status'] === 'object' ? f['Sequence Status']?.name : f['Sequence Status'] || ''
        switch (filter) {
          case 'sent':         return stat === 'Email Sent'
          case 'replied':      return stat === 'Replied'
          case 'new':          return stat === 'New'
          case 'noemail':      return !f['Contact Email']
          case 'interested':   return (typeof f['Reply Intent']==='object'?f['Reply Intent']?.name:f['Reply Intent']) === 'interested'
          case 'bounced':      return !!f['Bounced']
          case 'disqualified': return !!f['Disqualified']
          default:             return true
        }
      })
    }

    // Sort: sent leads first (most interesting), then by lead score desc
    records.sort((a, b) => {
      const aStatus = a.fields['Status']?.name || a.fields['Status'] || ''
      const bStatus = b.fields['Status']?.name || b.fields['Status'] || ''
      const statusPriority = (s: string) =>
        s === 'Booked Call' ? 0 : s === 'Replied' ? 1 : s === 'Email Sent' ? 2 : 3
      const sp = statusPriority(aStatus) - statusPriority(bStatus)
      if (sp !== 0) return sp
      return (b.fields['Lead Score'] || 0) - (a.fields['Lead Score'] || 0)
    })

    // ── CSV COLUMNS — clean, professional, business-ready ──────────────
    const SECTIONS = [
      // Company
      { header: 'Company',          fn: (f: any) => cell(f['Company']) },
      { header: 'Company Type',     fn: (f: any) => cell(f['Company Type']) },
      { header: 'Website',          fn: (f: any) => cell(f['Website']) },
      { header: 'GitHub Org',       fn: (f: any) => cell(f['GitHub Org URL']) },
      { header: 'Lead Score',       fn: (f: any) => cell(f['Lead Score']) },
      { header: 'Source',           fn: (f: any) => cell(f['Source']) },
      { header: 'Date Added',       fn: (f: any) => formatDate(f['Date Added']) },
      // Contact
      { header: 'Contact Name',     fn: (f: any) => cell(f['Contact Name']) },
      { header: 'Contact Email',    fn: (f: any) => cell(f['Contact Email']) },
      { header: 'Job Title',        fn: (f: any) => cell(f['Job Title']) },
      { header: 'Email Confidence', fn: (f: any) => cell(f['Email Confidence']) },
      // Outreach status
      { header: 'Status',           fn: (f: any) => cell(f['Status']) },
      { header: 'Sequence Status',  fn: (f: any) => cell(f['Sequence Status']) },
      { header: 'Last Contacted',   fn: (f: any) => formatDate(f['Last Contacted']) },
      { header: 'Follow Up #',      fn: (f: any) => cell(f['Follow Up #']) },
      // Engagement
      { header: 'Opens',            fn: (f: any) => cell(f['Open Count']) },
      { header: 'Last Opened',      fn: (f: any) => formatDate(f['Last Opened']) },
      { header: 'Reply Intent',     fn: (f: any) => cell(f['Reply Intent']) },
      { header: 'Reply Sent',       fn: (f: any) => yesNo(f['Reply Sent']) },
      // Flags
      { header: 'Bounced',          fn: (f: any) => yesNo(f['Bounced']) },
      { header: 'Disqualified',     fn: (f: any) => yesNo(f['Disqualified']) },
      // GitHub signals
      { header: 'GitHub Stars',     fn: (f: any) => cell(f['GitHub Stars']) },
      { header: 'GitHub Forks',     fn: (f: any) => cell(f['GitHub Forks']) },
      { header: 'Org Members',      fn: (f: any) => cell(f['Org Members']) },
      { header: 'Top Repos',        fn: (f: any) => cell(f['Top Repos']) },
    ]

    // Build CSV
    const header = SECTIONS.map(c => csvStr(c.header)).join(',')
    const rows   = records.map(r => {
      const f = r.fields
      return SECTIONS.map(c => c.fn(f)).join(',')
    })

    const today    = new Date().toISOString().split('T')[0]
    const label    = filter === 'all' ? 'all-leads' : filter
    const filename = `tradecafe-bd-agent-${label}-${today}.csv`

    // Professional header: metadata comment rows (ignored by Excel/Sheets, useful for humans)
    const meta = [
      `# TradeCafe BD Agent Export`,
      `# Generated: ${new Date().toLocaleString('en-US', {dateStyle:'long',timeStyle:'short'})}`,
      `# Filter: ${filter} · Total records: ${records.length}`,
      `# `,
    ].join('\n')

    const csv = meta + '\n' + header + '\n' + rows.join('\n')

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'

const BASE_ID = 'appCYgmFc8vTfwyv1'
const LEADS_TABLE = 'tblAsQXKEK9chUaT6'
const LOG_TABLE = 'tbli5CIBIqRXIkRqe'

const AT_KEY = process.env.AIRTABLE_API_KEY!

async function atFetch(method: string, path: string, body?: any) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${path}`
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${AT_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `Airtable ${res.status}`)
  return data
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const table = searchParams.get('table') || LEADS_TABLE
  try {
    // Paginate through all records (max 100 per page per Airtable REST API)
    let allRecords: any[] = []
    let offset: string | undefined
    do {
      const qs = offset ? `pageSize=100&offset=${offset}` : 'pageSize=100'
      const data = await atFetch('GET', `${table}?${qs}`)
      allRecords = allRecords.concat(data.records || [])
      offset = data.offset // undefined when no more pages
    } while (offset)
    return NextResponse.json({ ok: true, records: allRecords })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { action, table, recordId, fields } = await req.json()
  const tbl = table || LEADS_TABLE
  try {
    if (action === 'create') {
      // typecast:true lets Airtable auto-create new select options (e.g. "New", "GitHub Scrape")
      const data = await atFetch('POST', tbl, { records: [{ fields }], typecast: true })
      return NextResponse.json({ ok: true, record: data.records?.[0] })
    }
    if (action === 'update') {
      // typecast:true for status updates like "Email Sent"
      const data = await atFetch('PATCH', `${tbl}/${recordId}`, { fields, typecast: true })
      return NextResponse.json({ ok: true, record: data })
    }
    if (action === 'log') {
      const data = await atFetch('POST', LOG_TABLE, { records: [{ fields }], typecast: true })
      return NextResponse.json({ ok: true, record: data.records?.[0] })
    }
    if (action === 'ping') {
      const data = await atFetch('GET', `${LEADS_TABLE}?pageSize=1`)
      return NextResponse.json({ ok: true, count: data.records?.length })
    }
    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

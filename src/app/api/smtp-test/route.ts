import { NextRequest, NextResponse } from 'next/server'
import { verifyGmail } from '@/lib/gmail'

export async function POST(req: NextRequest) {
  const result = await verifyGmail()
  if (result.ok) {
    return NextResponse.json({ ok: true, message: `Gmail API connected — ${result.email}` })
  }
  return NextResponse.json({ ok: false, error: result.error || 'Gmail API connection failed' }, { status: 400 })
}

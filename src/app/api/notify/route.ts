import { NextRequest, NextResponse } from 'next/server'
import { sendDiscordNotification } from '@/lib/discord'

export async function POST(req: NextRequest) {
  const { message } = await req.json()
  await sendDiscordNotification(message || 'BD Agent notification')
  return NextResponse.json({ ok: true })
}

export async function GET() {
  await sendDiscordNotification('TradeCafe BD Agent — test notification ✓')
  return NextResponse.json({
    ok: !!process.env.DISCORD_WEBHOOK_URL,
    message: process.env.DISCORD_WEBHOOK_URL
      ? 'Test notification sent to Discord ✓'
      : 'DISCORD_WEBHOOK_URL not configured',
  })
}

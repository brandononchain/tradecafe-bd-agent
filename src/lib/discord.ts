// Discord webhook notification (optional)
export async function sendDiscordNotification(payload: string | Record<string, any>) {
  const url = process.env.DISCORD_WEBHOOK_URL
  if (!url) return
  try {
    const content = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.slice(0, 1900) }),
    })
  } catch {}
}

export type NotifyPayload =
  | { type: 'cron_summary'; leadsChecked: number; repliesFound: number; fu1Sent: number; fu2Sent: number; errors: number; hotReplies?: { company: string; intent: string; email: string }[] }
  | { type: 'new_reply'; company: string; contactName: string; email: string; intent: string; summary: string; suggestedReply: string }
  | { type: 'reply_sent'; company: string; email: string }
  | { type: 'sequence_complete'; totalSent: number; totalLeads: number }

const INTENT_EMOJI: Record<string, string> = {
  interested:  '🔥',
  not_now:     '⏳',
  question:    '❓',
  unsubscribe: '🚫',
  other:       '💬',
}

const INTENT_COLOR: Record<string, number> = {
  interested:  0x16a34a,
  not_now:     0xd97706,
  question:    0x2563eb,
  unsubscribe: 0xe84142,
  other:       0x6b7280,
}

function buildEmbed(payload: NotifyPayload) {
  const now = new Date().toLocaleString('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })

  if (payload.type === 'cron_summary') {
    const hasActivity = payload.repliesFound > 0 || payload.fu1Sent > 0 || payload.fu2Sent > 0
    const title = payload.repliesFound > 0
      ? `🔥 ${payload.repliesFound} new repl${payload.repliesFound === 1 ? 'y' : 'ies'}`
      : payload.fu1Sent + payload.fu2Sent > 0
        ? `📨 ${payload.fu1Sent + payload.fu2Sent} follow-up${payload.fu1Sent + payload.fu2Sent === 1 ? '' : 's'} sent`
        : '🤖 Cron ran — nothing new'

    const fields: { name: string; value: string; inline: boolean }[] = [
      { name: '📋 Leads checked', value: String(payload.leadsChecked), inline: true },
      { name: '📨 FU1 sent',      value: String(payload.fu1Sent),      inline: true },
      { name: '📨 FU2 sent',      value: String(payload.fu2Sent),      inline: true },
    ]
    if (payload.repliesFound > 0)
      fields.push({ name: '💬 New replies', value: String(payload.repliesFound), inline: true })
    if (payload.errors > 0)
      fields.push({ name: '⚠️ Errors', value: String(payload.errors), inline: true })
    if (payload.hotReplies?.length) {
      const lines = payload.hotReplies
        .map(r => `${INTENT_EMOJI[r.intent] || '💬'} **${r.company}** (${r.intent}) — ${r.email}`)
        .join('\n')
      fields.push({ name: '🔔 Reply details', value: lines, inline: false })
    }

    return {
      embeds: [{
        title,
        color:  payload.repliesFound > 0 ? 0x16a34a : hasActivity ? 0xe84142 : 0x6b7280,
        fields,
        footer: { text: `TradeCafe BD Agent · ${now} CT` },
      }],
    }
  }

  if (payload.type === 'new_reply') {
    return {
      embeds: [{
        title:       `${INTENT_EMOJI[payload.intent] || '💬'} Reply from ${payload.company}`,
        description: `**${payload.contactName || payload.email}** replied`,
        color:       INTENT_COLOR[payload.intent] || 0x6b7280,
        fields: [
          { name: 'Intent',  value: payload.intent,                                   inline: true  },
          { name: 'Email',   value: payload.email,                                    inline: true  },
          { name: 'Summary', value: payload.summary || 'No summary',                  inline: false },
          { name: '💡 Suggested reply', value: (payload.suggestedReply || 'None').slice(0, 1024), inline: false },
        ],
        footer: { text: `Open Inbox tab → reply in one click · ${now} CT` },
      }],
    }
  }

  if (payload.type === 'reply_sent') {
    return {
      embeds: [{
        title:  `✅ Reply sent to ${payload.company}`,
        color:  0x16a34a,
        fields: [{ name: 'To', value: payload.email, inline: true }],
        footer: { text: `TradeCafe BD Agent · ${now} CT` },
      }],
    }
  }

  if (payload.type === 'sequence_complete') {
    return {
      embeds: [{
        title:  `🚀 Campaign sent`,
        color:  0xe84142,
        fields: [
          { name: 'Emails sent', value: String(payload.totalSent),  inline: true },
          { name: 'Total leads', value: String(payload.totalLeads), inline: true },
        ],
        footer: { text: `TradeCafe BD Agent · ${now} CT` },
      }],
    }
  }

  return { content: 'Unknown notification type' }
}

export async function sendDiscordNotification(payload: NotifyPayload): Promise<boolean> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (!webhookUrl) return false
  try {
    const r = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(buildEmbed(payload)),
    })
    return r.ok
  } catch (e: any) {
    console.error('Discord notification error:', e.message)
    return false
  }
}

export const TEST_PAYLOAD: NotifyPayload = {
  type:         'cron_summary',
  leadsChecked: 176,
  repliesFound: 2,
  fu1Sent:      5,
  fu2Sent:      1,
  errors:       0,
  hotReplies: [
    { company: 'LangChain', intent: 'interested', email: 'harrison@langchain.com' },
    { company: 'VoltAgent', intent: 'not_now',    email: 'omer@voltagent.dev'    },
  ],
}

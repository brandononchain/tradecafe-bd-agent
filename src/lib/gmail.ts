import { google } from 'googleapis'

// Gmail API via OAuth2 — replaces nodemailer + IMAP entirely
// Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, SMTP_EMAIL

const getAuth = () => {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'https://developers.google.com/oauthplayground'
  )
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return oauth2
}

const getGmail = () => google.gmail({ version: 'v1', auth: getAuth() })

// ── Send email ──────────────────────────────────────────────────────────────
export async function sendEmail(opts: {
  to: string
  subject: string
  body: string
  fromName?: string
  fromEmail?: string
  replyToMessageId?: string
  threadId?: string
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const from = opts.fromEmail || process.env.SMTP_EMAIL || 'brandon@tradecafe.ai'
  const name = opts.fromName || process.env.SMTP_NAME || 'Brandon @ TradeCafe'

  const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#e0e0e0;max-width:600px;background:#0a0a0f;padding:24px;border-radius:8px">
${opts.body.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>').replace(/^/, '<p>').replace(/$/, '</p>')}
<p style="margin-top:32px;padding-top:16px;border-top:1px solid #222;font-size:11px;color:#555">
  To unsubscribe, reply with "unsubscribe".
</p></div>`

  // Build RFC 2822 message
  const headers = [
    `From: ${name} <${from}>`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="boundary_tradecafe"`,
    `List-Unsubscribe: <mailto:${from}?subject=unsubscribe>`,
    ...(opts.replyToMessageId ? [`In-Reply-To: ${opts.replyToMessageId}`, `References: ${opts.replyToMessageId}`] : []),
  ].join('\r\n')

  const raw = [
    headers,
    '',
    '--boundary_tradecafe',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    opts.body + '\n\n---\nTo unsubscribe, reply with "unsubscribe".',
    '',
    '--boundary_tradecafe',
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
    '',
    '--boundary_tradecafe--',
  ].join('\r\n')

  const encoded = Buffer.from(raw).toString('base64url')

  try {
    const gmail = getGmail()
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encoded,
        ...(opts.threadId ? { threadId: opts.threadId } : {}),
      },
    })
    return { ok: true, messageId: res.data.id || undefined }
  } catch (e: any) {
    return { ok: false, error: e.message || 'Gmail send failed' }
  }
}

// ── Send reply (in-thread) ──────────────────────────────────────────────────
export async function sendReply(opts: {
  to: string
  subject: string
  body: string
  originalMessageId: string
  threadId: string
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  return sendEmail({
    ...opts,
    replyToMessageId: originalMessageId(opts.originalMessageId),
  })
}

// Get actual Message-ID header from Gmail message ID
async function originalMessageId(gmailMsgId: string): Promise<string> {
  try {
    const gmail = getGmail()
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: gmailMsgId,
      format: 'metadata',
      metadataHeaders: ['Message-ID'],
    })
    const header = msg.data.payload?.headers?.find(h => h.name?.toLowerCase() === 'message-id')
    return header?.value || ''
  } catch {
    return ''
  }
}

// ── List inbox messages (replaces IMAP polling) ─────────────────────────────
export async function listInbox(opts?: {
  query?: string
  maxResults?: number
  afterDate?: string
}): Promise<{ messages: any[]; error?: string }> {
  try {
    const gmail = getGmail()
    let q = opts?.query || 'in:inbox'
    if (opts?.afterDate) q += ` after:${opts.afterDate}`

    const list = await gmail.users.messages.list({
      userId: 'me',
      q,
      maxResults: opts?.maxResults || 100,
    })

    const messages: any[] = []
    for (const m of list.data.messages || []) {
      const full = await gmail.users.messages.get({
        userId: 'me',
        id: m.id!,
        format: 'full',
      })

      const headers = full.data.payload?.headers || []
      const getH = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

      // Extract plain text body
      let bodyText = ''
      const parts = full.data.payload?.parts || []
      if (parts.length) {
        const textPart = parts.find(p => p.mimeType === 'text/plain')
        if (textPart?.body?.data) {
          bodyText = Buffer.from(textPart.body.data, 'base64url').toString('utf-8')
        }
      } else if (full.data.payload?.body?.data) {
        bodyText = Buffer.from(full.data.payload.body.data, 'base64url').toString('utf-8')
      }

      messages.push({
        id: full.data.id,
        threadId: full.data.threadId,
        from: getH('From'),
        fromEmail: getH('From').match(/<(.+?)>/)?.[1] || getH('From'),
        to: getH('To'),
        subject: getH('Subject'),
        date: getH('Date'),
        snippet: full.data.snippet || '',
        body: bodyText.slice(0, 5000),
        labelIds: full.data.labelIds || [],
      })
    }

    return { messages }
  } catch (e: any) {
    return { messages: [], error: e.message }
  }
}

// ── Verify Gmail API connection ─────────────────────────────────────────────
export async function verifyGmail(): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    const gmail = getGmail()
    const profile = await gmail.users.getProfile({ userId: 'me' })
    return { ok: true, email: profile.data.emailAddress || '' }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

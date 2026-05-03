import { NextRequest, NextResponse } from 'next/server'

const BASE  = 'appCYgmFc8vTfwyv1'
const TABLE = 'tblAsQXKEK9chUaT6'
const AT    = () => process.env.AIRTABLE_API_KEY!

// 1×1 transparent GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const recordId = params.id
  const today    = new Date().toISOString().split('T')[0]

  // Fire-and-forget Airtable update — don't block the pixel response
  if (recordId?.startsWith('rec')) {
    ;(async () => {
      try {
        // Get current open count
        const r = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}/${recordId}`, {
          headers: { Authorization: `Bearer ${AT()}` },
        })
        if (!r.ok) return
        const d = await r.json()
        const currentCount = d.fields?.['Open Count'] || 0

        await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}/${recordId}`, {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${AT()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              'Open Count':  currentCount + 1,
              'Last Opened': today,
            },
            typecast: true,
          }),
        })
      } catch { /* non-fatal */ }
    })()
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type':  'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma':        'no-cache',
      'Expires':       '0',
    },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyZoomSignature } from '@/lib/integrations/_shared/webhook-verify'

export async function POST(req: NextRequest) {
  const secret = process.env.ZOOM_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Zoom webhook not configured' }, { status: 501 })

  const timestamp = req.headers.get('x-zm-request-timestamp') ?? ''
  const signature = req.headers.get('x-zm-signature') ?? ''
  const rawBody = await req.text()

  if (!verifyZoomSignature(rawBody, timestamp, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(rawBody)

  // Zoom URL validation challenge
  if (event.event === 'endpoint.url_validation') {
    const { createHmac } = await import('crypto')
    const hash = createHmac('sha256', secret).update(event.payload.plainToken).digest('hex')
    return NextResponse.json({ plainToken: event.payload.plainToken, encryptedToken: hash })
  }

  // Handle meeting ended — no-op for Phase 1
  // Future: update session status when meeting ends
  if (event.event === 'meeting.ended') {
    // TODO: mark session as ended, store recording URL if available
  }

  return NextResponse.json({ received: true })
}

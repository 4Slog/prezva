import { createAdminClient } from '@/lib/supabase/admin'
import { createHmac } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('x-ghl-signature') ?? ''

  const secret = process.env.GHL_WEBHOOK_SECRET ?? ''
  if (secret) {
    const expected = createHmac('sha256', secret).update(body).digest('hex')
    if (sig !== expected) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = createAdminClient()

  await admin.from('integration_webhook_log').insert({
    provider: 'ghl',
    event_type: (payload.type ?? payload.event ?? 'unknown') as string,
    payload,
    received_at: new Date().toISOString(),
  }).then(() => undefined, () => undefined) // non-blocking log

  switch (payload.type as string) {
    case 'ContactCreated':
    case 'ContactUpdated':
      // Sprint GHL-2: sync GHL contact → Prezva registration
      break
    case 'OpportunityCreated':
    case 'OpportunityStatusChanged':
      // Sprint GHL-2: pipeline stage → attendee status
      break
    default:
      break
  }

  return NextResponse.json({ received: true })
}

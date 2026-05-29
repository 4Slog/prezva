// Resend webhook — bounce + spam complaint handling. Inserts offending emails
// into email_suppressions so outbound jobs (announcement, reminder, etc.) skip them.
// Configure at resend.com/webhooks; signature verified via Svix (Resend's underlying provider).

import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createAdminClient } from '@/lib/supabase/admin'

type ResendEvent = {
  type: string
  data?: {
    email_id?: string
    to?: string | string[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const rawBody = await req.text()
  const svixId        = req.headers.get('svix-id') ?? ''
  const svixTimestamp = req.headers.get('svix-timestamp') ?? ''
  const svixSignature = req.headers.get('svix-signature') ?? ''

  let event: ResendEvent
  try {
    const wh = new Webhook(secret)
    event = wh.verify(rawBody, {
      'svix-id':        svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendEvent
  } catch (err) {
    console.error('[resend-webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const reasonMap: Record<string, 'bounce' | 'complaint'> = {
    'email.bounced':    'bounce',
    'email.complained': 'complaint',
  }
  const reason = reasonMap[event.type]
  if (!reason) {
    // Ack unhandled event types so Resend doesn't retry
    return NextResponse.json({ received: true, ignored: event.type })
  }

  const to = event.data?.to
  const recipients = Array.isArray(to) ? to : to ? [to] : []
  if (recipients.length === 0) {
    console.warn(`[resend-webhook] ${event.type} event missing recipient`)
    return NextResponse.json({ received: true, skipped: 'no recipient' })
  }

  const supabase = createAdminClient()
  const rows = recipients.map((email) => ({
    email:     email.toLowerCase(),
    reason,
    raw_event: event as unknown as Record<string, unknown>,
  }))

  const { error } = await supabase
    .from('email_suppressions')
    .upsert(rows, { onConflict: 'email' })

  if (error) {
    console.error('[resend-webhook] upsert failed:', error)
    return NextResponse.json({ error: 'DB write failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true, suppressed: recipients.length })
}

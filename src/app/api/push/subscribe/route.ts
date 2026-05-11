import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const { subscription, registrationId } = await req.json()
  if (!subscription?.endpoint || !registrationId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const supabase = await createClient()
  await supabase.from('push_subscriptions').upsert({
    registration_id: registrationId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys?.p256dh ?? '',
    auth: subscription.keys?.auth ?? '',
  }, { onConflict: 'endpoint' })
  return NextResponse.json({ ok: true })
}

import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'

if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL ?? 'mailto:hello@prezva.app',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
}

export async function sendPushToRegistration(
  registrationId: string,
  title: string,
  body: string,
  url?: string,
): Promise<void> {
  if (!process.env.VAPID_PRIVATE_KEY) {
    console.warn('[push] VAPID_PRIVATE_KEY not set — push notifications disabled. Add to Vercel env vars.')
    return
  }

  const supabase = await createClient()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('registration_id', registrationId)

  if (!subs?.length) return

  const payload = JSON.stringify({ title, body, url })
  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
    )
  )

  // Remove expired/invalid subscriptions (410 Gone)
  const expired = subs.filter((_, i) => {
    const r = results[i]
    return r.status === 'rejected' && (r.reason as any)?.statusCode === 410
  })
  if (expired.length) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', expired.map(s => s.endpoint))
  }
  // TODO: wire this into createOneOnOneRoom to replace createNotification when web push is confirmed working end-to-end
}

export async function sendAnnouncementPush(eventId: string, title: string, body: string): Promise<void> {
  if (!process.env.VAPID_PRIVATE_KEY) {
    console.warn('[push] VAPID_PRIVATE_KEY not set — push notifications disabled. Add to Vercel env vars.')
    return
  }

  const supabase = await createClient()
  const { data: regs } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
  const regIds = (regs ?? []).map(r => r.id)
  if (!regIds.length) return
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, registration_id')
    .in('registration_id', regIds)

  if (!subs?.length) return

  const payload = JSON.stringify({ title, body })
  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
    )
  )

  // Remove expired/invalid subscriptions (410 Gone)
  const expired = subs.filter((_, i) => {
    const r = results[i]
    return r.status === 'rejected' && (r.reason as any)?.statusCode === 410
  })
  if (expired.length) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', expired.map(s => s.endpoint))
  }
}

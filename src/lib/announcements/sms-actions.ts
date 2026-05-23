'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { assertOrgRole } from '@/lib/orgs/actions'

export async function sendSMSAnnouncement(eventId: string, message: string) {
  const supabase = await createClient()
  const user = await requireUser()

  const { data: event } = await supabase
    .from('events')
    .select('org_id, title')
    .eq('id', eventId)
    .single()
  if (!event) return { error: 'Event not found' }

  await assertOrgRole(supabase, (event as any).org_id, user.id, ['owner', 'admin'])

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_FROM_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    return { error: 'SMS is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER to your environment variables.' }
  }

  const admin = createAdminClient()

  const { data: registrations } = await admin
    .from('registrations')
    .select('id, attendee_name, attendee_phone')
    .eq('event_id', eventId)
    .in('status', ['confirmed', 'checked_in'])
    .not('attendee_phone', 'is', null)
    .limit(500)

  const phones = ((registrations ?? []) as any[])
    .map(r => r.attendee_phone?.trim())
    .filter(Boolean)

  if (!phones.length) return { error: 'No attendees with phone numbers found.' }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  let sent = 0
  let failed = 0
  const truncatedMsg = message.length > 160 ? message.slice(0, 157) + '...' : message

  for (const phone of phones) {
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: fromNumber,
            To: phone,
            Body: truncatedMsg,
          }).toString(),
        }
      )
      if (res.ok) sent++
      else failed++
    } catch {
      failed++
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  return { ok: true, sent, failed, total: phones.length }
}

export async function getSMSEligibleCount(eventId: string): Promise<number> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .in('status', ['confirmed', 'checked_in'])
    .not('attendee_phone', 'is', null)
  return count ?? 0
}

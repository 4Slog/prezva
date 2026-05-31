'use server'
import Telnyx from 'telnyx'
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

  const apiKey = process.env.TELNYX_API_KEY
  const fromNumber = process.env.TELNYX_PHONE_NUMBER

  if (!apiKey || !fromNumber) {
    console.warn('[sms] Telnyx not configured. Add TELNYX_API_KEY and TELNYX_PHONE_NUMBER to environment variables.')
    return { error: 'SMS is not configured. Add TELNYX_API_KEY and TELNYX_PHONE_NUMBER to your environment variables.' }
  }

  const admin = createAdminClient()

  const { data: registrations } = await admin
    .from('registrations')
    .select('id, attendee_name, attendee_phone')
    .eq('event_id', eventId)
    .in('status', ['confirmed'])
    .eq('sms_opt_in', true)
    .not('attendee_phone', 'is', null)
    .limit(500)

  const phones = ((registrations ?? []) as any[])
    .map(r => r.attendee_phone?.trim())
    .filter(Boolean)

  if (!phones.length) return { error: 'No attendees with phone numbers and SMS opt-in found.' }

  const telnyx = new Telnyx({ apiKey })
  let sent = 0
  let failed = 0
  const truncatedMsg = message.length > 160 ? message.slice(0, 157) + '...' : message

  for (const phone of phones) {
    try {
      // SMS sending live once Telnyx campaign CRX9TO7 clears carrier review
      await telnyx.messages.send({ from: fromNumber, to: phone, text: truncatedMsg })
      sent++
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
    .in('status', ['confirmed'])
    .eq('sms_opt_in', true)
    .not('attendee_phone', 'is', null)
  return count ?? 0
}

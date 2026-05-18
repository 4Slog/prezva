'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/audit/log'

export interface SelfCheckInResult {
  success: boolean
  error?: string
  attendee_name?: string
  event_title?: string
  event_date?: string
  already_checked_in?: boolean
  check_in_time?: string
}

export async function selfCheckInByToken(token: string): Promise<SelfCheckInResult> {
  const admin = createAdminClient()

  // Validate QR token against registrations
  const { data: reg } = await admin
    .from('registrations')
    .select('id, user_id, attendee_name, attendee_email, status, event_id, events(id, title, start_at, timezone, slug)')
    .eq('qr_code', token)
    .maybeSingle()

  if (!reg) return { success: false, error: 'This check-in link is invalid.' }
  if ((reg as any).status === 'cancelled') return { success: false, error: 'This registration has been cancelled.' }
  if ((reg as any).status === 'pending') return { success: false, error: 'Your registration is pending approval.' }

  const event = (reg as any).events as any

  // Check if already checked in
  const { data: existing } = await admin
    .from('check_ins')
    .select('id, checked_in_at')
    .eq('registration_id', (reg as any).id)
    .is('session_id', null)
    .maybeSingle()

  const eventDate = event?.start_at
    ? new Date(event.start_at).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
        timeZone: event.timezone ?? 'UTC',
      })
    : undefined

  if (existing) {
    return {
      success: true,
      already_checked_in: true,
      check_in_time: (existing as any).checked_in_at,
      attendee_name: (reg as any).attendee_name,
      event_title: event?.title,
      event_date: eventDate,
    }
  }

  // Perform check-in using admin client (no auth required for self check-in)
  const { error: ciErr } = await admin.from('check_ins').insert({
    event_id: (reg as any).event_id,
    registration_id: (reg as any).id,
    checked_in_by: null,
    method: 'self_checkin',
    device_id: 'magic-link',
    synced_at: new Date().toISOString(),
  })

  if (ciErr) return { success: false, error: 'Check-in failed. Please try again or see staff.' }

  // Update registration status
  await admin
    .from('registrations')
    .update({ status: 'checked_in', checked_in_at: new Date().toISOString() })
    .eq('id', (reg as any).id)

  // Award points if user has account
  if ((reg as any).user_id) {
    const { awardPoints } = await import('@/lib/engagement/sprint10-actions')
    await awardPoints((reg as any).event_id, (reg as any).user_id, 'checkin').catch(() => {})
  }

  await logAudit(admin as any, null, null, 'checkin.self', 'registrations', (reg as any).id, {
    method: 'magic_link'
  })

  return {
    success: true,
    already_checked_in: false,
    attendee_name: (reg as any).attendee_name,
    event_title: event?.title,
    event_date: eventDate,
  }
}

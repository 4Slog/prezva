'use server'

import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit/log'
import { checkRateLimit, pinLookupLimiter } from '@/lib/ratelimit'

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
    method: 'self',
    device_id: 'magic-link',
    synced_at: new Date().toISOString(),
  })

  if (ciErr) return { success: false, error: 'Check-in failed. Please try again or see staff.' }

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

// ── Session self-check-in (via registrationId, for signed-in attendees) ────────
export async function selfCheckInRegistration(
  registrationId: string,
  sessionId: string | null,
): Promise<SelfCheckInResult> {
  // Verify caller is the registration owner before doing anything with admin client
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not signed in.' }

  const admin = createAdminClient()

  const { data: reg } = await admin
    .from('registrations')
    .select('id, user_id, attendee_name, status, event_id, events(id, title, start_at, timezone)')
    .eq('id', registrationId)
    .maybeSingle()

  // Ownership guard — generic error to avoid leaking registration existence
  if (!reg || (reg as any).user_id !== user.id) return { success: false, error: 'Registration not found.' }
  if ((reg as any).status === 'cancelled') return { success: false, error: 'This registration has been cancelled.' }
  if ((reg as any).status !== 'confirmed') return { success: false, error: 'Your registration is not confirmed.' }

  const event = (reg as any).events as any

  if (sessionId) {
    // Session scope: unique constraint prevents duplicates — check gracefully
    const { data: existing } = await admin
      .from('check_ins')
      .select('id, checked_in_at')
      .eq('registration_id', registrationId)
      .eq('session_id', sessionId)
      .maybeSingle()

    if (existing) {
      return { success: true, already_checked_in: true, check_in_time: (existing as any).checked_in_at, attendee_name: (reg as any).attendee_name, event_title: event?.title }
    }

    const { error } = await admin.from('check_ins').insert({
      event_id: (reg as any).event_id,
      registration_id: registrationId,
      session_id: sessionId,
      checked_in_by: null,
      method: 'self',
      checked_in_source: 'self',
      synced_at: new Date().toISOString(),
    })

    if (error) return { success: false, error: 'Check-in failed. Please try again or see staff.' }
  } else {
    // Event scope: manual dedup (NULL != NULL in unique constraint)
    const { data: existing } = await admin
      .from('check_ins')
      .select('id, checked_in_at')
      .eq('registration_id', registrationId)
      .is('session_id', null)
      .maybeSingle()

    if (existing) {
      return { success: true, already_checked_in: true, check_in_time: (existing as any).checked_in_at, attendee_name: (reg as any).attendee_name, event_title: event?.title }
    }

    const { error } = await admin.from('check_ins').insert({
      event_id: (reg as any).event_id,
      registration_id: registrationId,
      checked_in_by: null,
      method: 'self',
      checked_in_source: 'self',
      device_id: 'self-scan',
      synced_at: new Date().toISOString(),
    })

    if (error) return { success: false, error: 'Check-in failed. Please try again or see staff.' }
  }

  if ((reg as any).user_id) {
    const { awardPoints } = await import('@/lib/engagement/sprint10-actions')
    await awardPoints((reg as any).event_id, (reg as any).user_id, 'checkin').catch(() => {})
  }

  await logAudit(admin as any, null, null, 'checkin.self', 'registrations', registrationId, {
    method: 'self', session_id: sessionId ?? undefined,
  })

  return { success: true, already_checked_in: false, attendee_name: (reg as any).attendee_name, event_title: event?.title }
}

// ── Email+PIN self-check-in ────────────────────────────────────────────────────
// Rate-limited. Returns a generic error on any failure — never reveals whether
// the email exists or whether it was the email vs PIN that failed.
export async function selfCheckInByEmailPin(
  eventId: string,
  sessionId: string | null,
  email: string,
  pin: string,
): Promise<SelfCheckInResult> {
  const GENERIC_ERROR = "Couldn't check you in — check your email and PIN, or see staff."

  const ip = (await headers()).get('x-forwarded-for') ?? 'unknown'
  const { limited } = await checkRateLimit(pinLookupLimiter, ip)
  if (limited) return { success: false, error: GENERIC_ERROR }

  const admin = createAdminClient()

  const { data: reg } = await admin
    .from('registrations')
    .select('id, user_id, attendee_name, pin, status, event_id, events(id, title, start_at, timezone)')
    .eq('event_id', eventId)
    .eq('attendee_email', email.toLowerCase())
    .eq('status', 'confirmed')
    .maybeSingle()

  // Generic failure on no match or wrong pin — never distinguish
  if (!reg || (reg as any).pin !== pin) {
    return { success: false, error: GENERIC_ERROR }
  }

  const event = (reg as any).events as any

  if (sessionId) {
    const { data: existing } = await admin
      .from('check_ins')
      .select('id, checked_in_at')
      .eq('registration_id', (reg as any).id)
      .eq('session_id', sessionId)
      .maybeSingle()

    if (existing) {
      return { success: true, already_checked_in: true, check_in_time: (existing as any).checked_in_at, attendee_name: (reg as any).attendee_name, event_title: event?.title }
    }

    const { error } = await admin.from('check_ins').insert({
      event_id: eventId,
      registration_id: (reg as any).id,
      session_id: sessionId,
      checked_in_by: null,
      method: 'self',
      checked_in_source: 'self',
      synced_at: new Date().toISOString(),
    })

    if (error) return { success: false, error: GENERIC_ERROR }
  } else {
    // Event scope: manual dedup (NULL != NULL in unique constraint)
    const { data: existing } = await admin
      .from('check_ins')
      .select('id, checked_in_at')
      .eq('registration_id', (reg as any).id)
      .is('session_id', null)
      .maybeSingle()

    if (existing) {
      return { success: true, already_checked_in: true, check_in_time: (existing as any).checked_in_at, attendee_name: (reg as any).attendee_name, event_title: event?.title }
    }

    const { error } = await admin.from('check_ins').insert({
      event_id: eventId,
      registration_id: (reg as any).id,
      checked_in_by: null,
      method: 'self',
      checked_in_source: 'self',
      device_id: 'email-pin',
      synced_at: new Date().toISOString(),
    })

    if (error) return { success: false, error: GENERIC_ERROR }
  }

  if ((reg as any).user_id) {
    const { awardPoints } = await import('@/lib/engagement/sprint10-actions')
    await awardPoints(eventId, (reg as any).user_id, 'checkin').catch(() => {})
  }

  await logAudit(admin as any, null, null, 'checkin.self', 'registrations', (reg as any).id, {
    method: 'email_pin', session_id: sessionId ?? undefined,
  })

  return { success: true, already_checked_in: false, attendee_name: (reg as any).attendee_name, event_title: event?.title }
}

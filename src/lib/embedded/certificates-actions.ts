'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { issueCertificateCore } from '@/lib/certificates/issue-core'

// ── Embed context ─────────────────────────────────────────────────────────────

async function resolveEmbedContext() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) throw new Error('No embed session')
  const session = await verifyEmbeddedSession(token)
  const db = createAdminClient()
  const { data: link } = await db
    .from('ghl_location_links')
    .select('org_id')
    .eq('ghl_location_id', session.location_id)
    .maybeSingle()
  if (!link) throw new Error('Location not linked to any organization')
  return { db, orgId: link.org_id }
}

async function assertEventOwnership(
  db: ReturnType<typeof createAdminClient>,
  eventId: string,
  orgId: string,
) {
  const { data } = await db
    .from('events')
    .select('id, org_id')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!data) throw new Error('Event not found or access denied')
  return data
}

// ── Data loader ───────────────────────────────────────────────────────────────

export async function embedGetCertificatesData(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data: event } = await db
    .from('events')
    .select('id, certificate_enabled, certificate_min_session_attendance_pct')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .single()

  const { data: templates } = await db
    .from('certificate_templates')
    .select('id, name, is_default, created_at')
    .eq('org_id', orgId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  const { data: issuedRows } = await db
    .from('issued_certificates')
    .select('template_id')
    .eq('event_id', eventId)

  const issuedCountsByTemplate: Record<string, number> = {}
  for (const row of (issuedRows ?? []) as { template_id: string | null }[]) {
    if (!row.template_id) continue
    issuedCountsByTemplate[row.template_id] = (issuedCountsByTemplate[row.template_id] ?? 0) + 1
  }

  const totalIssued = (issuedRows ?? []).length

  return { event, templates: templates ?? [], issuedCountsByTemplate, totalIssued }
}

// ── Single issue ──────────────────────────────────────────────────────────────

export async function embedIssueOrGetCertificate(
  eventId: string,
  registrationId: string,
): Promise<{ data?: any; skipped?: true; error?: string }> {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  // FK-guard: confirm registration belongs to this event
  const { data: reg } = await db
    .from('registrations')
    .select('id, event_id, user_id, attendee_name, attendee_email, events(org_id, title, slug)')
    .eq('id', registrationId)
    .maybeSingle()

  if (!reg || reg.event_id !== eventId) return { error: 'Registration not found' }

  // All three guards above — embed session, event ownership, and the
  // registration/event FK — stay HERE, at the door. issueCertificateCore
  // authorizes nothing, deliberately; read its header before moving any of
  // this into it.
  //
  // Everything past this point is now identical to the dashboard door by
  // construction rather than by inspection. That is the entire point of R61:
  // this door carried its own copy of the issuance logic, and that copy never
  // wrote to GHL and never emailed the attendee.
  return issueCertificateCore(db, registrationId, 'embed')
}

// ── Bulk issue ────────────────────────────────────────────────────────────────

export async function embedBulkIssueCertificates(
  eventId: string,
): Promise<{ issued: number; skipped: number; failed: number }> {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data: regs } = await db
    .from('registrations')
    .select('id')
    .eq('event_id', eventId)
    .in('status', ['confirmed'])

  let issued = 0, skipped = 0, failed = 0
  for (const reg of (regs ?? []) as { id: string }[]) {
    const result = await embedIssueOrGetCertificate(eventId, reg.id)
    if ('skipped' in result && result.skipped) {
      skipped++
    } else if ('error' in result && result.error) {
      failed++
    } else {
      issued++
    }
  }

  return { issued, skipped, failed }
}

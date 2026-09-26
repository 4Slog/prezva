'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { issueCertificateCore } from '@/lib/certificates/issue-core'
import { enqueueCertificateIssueSweep } from '@/lib/trigger'
import { countPublishedSessions } from '@/lib/certificates/published-sessions'

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

  // R62: the size of what the bulk button will queue. Confirmed registrations,
  // NOT eligible attendees. It rides along on this loader rather than getting
  // its own action so the embed page pays one resolveEmbedContext, not two.
  const { count: confirmedCount } = await db
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  // F-R6: drives the zero-session warning on the embedded certificates page.
  const publishedSessions = await countPublishedSessions(db, eventId)

  return {
    event,
    publishedSessions,
    templates: templates ?? [],
    issuedCountsByTemplate,
    totalIssued,
    confirmedCount: confirmedCount ?? 0,
  }
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

// R62. The embed bulk door. Same change as the dashboard's: authorize, count,
// enqueue. It no longer loops, and it no longer calls
// embedIssueOrGetCertificate — the sweep runs issueCertificateCore directly,
// once per candidate, in the background.
//
// Authorization is UNCHANGED and stays here: resolveEmbedContext (signed embed
// session -> linked org) plus assertEventOwnership. Both guards run BEFORE the
// enqueue, because the sweep itself has no principal to check.
export type EmbedBulkIssueResult = { queued: number } | { error: string }

export async function embedBulkIssueCertificates(
  eventId: string,
): Promise<EmbedBulkIssueResult> {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  // head + exact — see the identical count in src/lib/certificates/bulk-issue.ts.
  const { count } = await db
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  const queued = count ?? 0

  const handle = await enqueueCertificateIssueSweep({ eventId, via: 'embed' })

  // Null handle means TRIGGER_SECRET_KEY is unset or Trigger.dev is down — the
  // helper swallows both into null and never throws. Returning { queued } here
  // would report a background run that does not exist. See the identical guard
  // in src/lib/certificates/bulk-issue.ts.
  if (!handle) return { error: 'queue-unavailable' }

  return { queued }
}

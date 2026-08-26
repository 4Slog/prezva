'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { enqueueCertificateIssueSweep } from '@/lib/trigger'

// R62. The dashboard bulk door. It authorizes, counts, and enqueues — it no
// longer issues anything itself.
//
// Authorization is UNCHANGED and stays here: requireUser + assertPermission on
// certificates.manage. The sweep it enqueues has no principal and performs no
// authz, so this check is the only thing standing between a request and a
// few hundred certificates.
export type BulkIssueResult = { queued: number } | { error: string }

export async function bulkIssueCertificates(eventId: string): Promise<BulkIssueResult> {
  const user = await requireUser()
  const admin = createAdminClient()

  const { data: event } = await admin.from('events').select('org_id').eq('id', eventId).single()
  // Distinct from a dropped enqueue on purpose. This used to return
  // { issued: 0, skipped: 0, failed: 0 }, which read to the caller as a
  // completed run over an empty event — a missing event and a successful
  // no-op were the same value.
  if (!event) return { error: 'event-not-found' }

  await assertPermission(event.org_id, user.id, 'certificates.manage')

  // head + exact: this only ever needed the number. Fetching every row to take
  // .length also risked disagreeing with the page's own count under PostgREST's
  // max-rows cap — same question, two techniques, two answers.
  const { count } = await admin
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  const queued = count ?? 0

  const handle = await enqueueCertificateIssueSweep({ eventId, via: 'dashboard' })

  // enqueueCertificateIssueSweep NEVER throws: it returns null when
  // TRIGGER_SECRET_KEY is unset and swallows a Trigger.dev outage into a
  // console.error plus null. So the await completing is NOT evidence the sweep
  // was queued, and reporting `queued` off a null handle would tell the
  // organizer that several hundred certificates are on their way when nothing
  // is running at all. Every existing call site in this file's neighbours
  // discards this handle, which is precisely why a dropped enqueue has been
  // invisible until now.
  if (!handle) return { error: 'queue-unavailable' }

  return { queued }
}

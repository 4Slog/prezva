import { schemaTask } from '@trigger.dev/sdk'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../lib/supabase-admin'
import { issueCertificateCore, type CertificateIssueSource } from '@/lib/certificates/issue-core'
import { logAudit } from '@/lib/audit/log'

// R62. Bulk certificate issuance for one event, moved off the request path.
//
// Both bulk doors used to run this as a serial loop inside a server action.
// R61 gave each iteration a GHL half — a merge-field write plus a stage-move
// enqueue — and a few-hundred-registration event then took many minutes in a
// single request. Vercel killed it partway, and because the loop's counters
// lived in that request's memory, there was NO RECORD of how far it got: no
// audit row, no partial result, nothing to resume from. The certificates it
// had issued were real, the ones it hadn't were indistinguishable from
// never-requested.
//
// Shape follows ce-progress-sweep: finder, per-item runner with a discriminated
// result, task. The BASE is schemaTask rather than schedules.task, because this
// sweep is event-scoped and fired from an action — it needs a payload, and it
// needs tasks.trigger<typeof …> to type-resolve in src/lib/trigger.ts.
//
// ── AUTHORIZATION HAPPENS AT THE DOOR, NOT HERE. ─────────────────────────────
// The runner calls issueCertificateCore DIRECTLY — never issueOrGetCertificate,
// never the embed action. Both of those authorize a principal this task does
// not have and cannot reconstruct: there is no session here, no cookie, no
// user. The action that enqueued the sweep already authorized the organizer
// (requireUser + assertPermission on the dashboard door, embed session +
// event-ownership on the embed door), and issueCertificateCore does no authz by
// design — read its header. Routing this through a door-level function would
// mean either faking a principal or weakening that door's check.

export type CertificateIssueResult =
  | { issued: true; certificateId: string }
  | { skipped: true; reason: string }
  | { failed: true; error: string }

// Candidate selection, deliberately identical to what the two serial loops
// selected: confirmed registrations for this event. Eligibility is NOT
// evaluated here — issueCertificateCore owns that decision, and a candidate
// that turns out ineligible is a 'skipped' result, not a non-candidate.
// Splitting the eligibility check across both would let the two disagree.
export async function findCertificateIssueCandidates(
  admin: SupabaseClient,
  eventId: string,
): Promise<string[]> {
  const { data: confirmed, error } = await admin
    .from('registrations')
    .select('id')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  // THROW rather than fall through to []. Swallowing this error would hand the
  // task an empty candidate list, and the task would then write a
  // certificate.bulk_issue row reading { issued: 0, skipped: 0, failed: 0 } —
  // byte-identical to a legitimately empty event — and return success, so
  // Trigger.dev would never retry it. The organizer has already been told their
  // attendees were queued. A transient read failure must fail the run and
  // retry, not forge a clean audit row saying there was nothing to do.
  if (error) throw new Error(`candidate select failed for event ${eventId}: ${error.message}`)

  return (confirmed ?? []).map((r) => r.id as string)
}

// TOTAL by construction: every path returns a CertificateIssueResult, including
// a throw out of the core. That is why the task's loop below has no try/catch —
// one registration's failure must never abort the rest of the sweep, and a
// runner that can throw would put that guarantee in the caller's hands.
//
// Classification order matches the loops this replaces: skipped is checked
// BEFORE error, because an ineligible registration comes back as
// { skipped: true, error: <reason> } with both fields set. Reversing these two
// branches reports every ineligible attendee as a failure.
export async function processCertificateIssueCandidate(
  admin: SupabaseClient,
  registrationId: string,
  source: CertificateIssueSource,
): Promise<CertificateIssueResult> {
  try {
    const result = await issueCertificateCore(admin, registrationId, source)

    if ('skipped' in result && result.skipped) {
      return { skipped: true, reason: result.error ?? 'Not eligible' }
    }
    if ('error' in result && result.error) {
      return { failed: true, error: result.error }
    }
    return { issued: true, certificateId: (result.data as { id?: string } | undefined)?.id ?? '' }
  } catch (e) {
    console.error('[certificate-issue-sweep] issueCertificateCore threw:', registrationId, e)
    return { failed: true, error: e instanceof Error ? e.message : String(e) }
  }
}

export const certificateIssueSweepTask = schemaTask({
  id: 'certificate-issue-sweep',
  // OVERRIDES trigger.config.ts's global maxDuration: 300. Without this the
  // batch achieves nothing: the serial loop below is the SAME loop that was
  // timing out, and 300s is tighter than the Vercel limit it was moved off.
  // A killed run is worse here than it was on the request path, because
  // logAudit fires only after the loop — a sweep cut off at candidate 180 of
  // 300 leaves no audit row at all, which is precisely the "no record of where
  // it stopped" failure this task exists to end.
  //
  // Sized for the workload named in the header: a few hundred registrations at
  // roughly a second each (eligibility read, insert, GHL merge PUT, stage-move
  // enqueue). Retries restart from candidate 0, which is affordable only
  // because issueCertificateCore returns the existing certificate rather than
  // re-issuing — but affordable is not free, so the budget is set to make the
  // first attempt sufficient rather than to lean on the retry.
  maxDuration: 3600,
  schema: z.object({
    eventId: z.string(),
    // Carried through from the door that enqueued the sweep. It is the ONLY
    // attribution the audit row gets: the embed door has no Prezva user id at
    // all (its session carries a GHL location_id and an optional email), so
    // user_id is null on both paths and `via` is what distinguishes them.
    via: z.enum(['dashboard', 'embed']),
  }),
  run: async ({ eventId, via }) => {
    const admin = createAdminClient()

    const { data: event } = await admin
      .from('events')
      .select('org_id')
      .eq('id', eventId)
      .maybeSingle()
    const orgId = (event?.org_id as string | undefined) ?? null

    const candidates = await findCertificateIssueCandidates(admin, eventId)

    // NOTE ON `issued`: it counts registrations that HAVE a certificate after
    // the call, not certificates created by this run. issueCertificateCore
    // returns the existing row for an already-issued registration, and the
    // runner cannot tell that apart from a fresh insert without a signal the
    // core does not currently emit. So a re-run over a fully-issued event
    // audits issued: N having created nothing. Read this number as coverage,
    // not as work performed. Splitting it needs a return-value change in
    // issue-core.ts — deliberately not done here.
    let issued = 0
    let skipped = 0
    let failed = 0
    for (const registrationId of candidates) {
      const result = await processCertificateIssueCandidate(admin, registrationId, via)
      if ('issued' in result) issued++
      else if ('skipped' in result) skipped++
      else failed++
    }

    // THE ONLY RECORD OF THE OUTCOME. Once the work is async the caller gets
    // back a queued count and nothing else — it is long gone by the time these
    // numbers exist. Dropping this write returns the sweep to exactly the
    // invisibility that made the Vercel timeout unbudgeable: work that ran,
    // succeeded or failed, and left no trace either way.
    //
    // user_id is null by necessity, not oversight — see the `via` comment
    // above, and issue-core.ts's own certificate.issue row, which is null for
    // the same reason.
    await logAudit(admin, orgId, null, 'certificate.bulk_issue', 'events', eventId, {
      issued,
      skipped,
      failed,
      eventId,
      via,
    })

    return { issued, skipped, failed }
  },
})

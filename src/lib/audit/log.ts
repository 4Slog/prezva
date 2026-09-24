import { createAdminClient } from '@/lib/supabase/admin'

// Writes one row to the audit trail. Two guarantees, both kept: this never
// throws, and an audit failure never surfaces to the user. A failure is
// console.error'd with the action so it is visible in logs.
//
// ── History: why the table held (almost) nothing ──────────────────────────────
// 1. `audit_logs.action` was an enum no call site's dotted value belonged to;
//    every insert failed with 22P02 and the returned `{ error }` was never read.
//    Migration 0146 widened the column to text; this function now reads the
//    error instead of discarding it.
// 2. (O120) RLS on audit_logs has only a SELECT policy. ~30 call sites passed
//    the USER-SCOPED client, so every one of those inserts was refused by RLS.
//    Even the rows that did land were invisible: no call site set event_id and
//    most passed org_id null, while the audit-log pages filter on exactly those
//    columns.
//
// ── How it works now ─────────────────────────────────────────────────────────
// - The write ALWAYS goes through the service-role client created here. The
//   client argument is kept only so the ~40 call sites keep compiling; it is
//   ignored. There is deliberately NO insert policy: users must never be able
//   to write or forge audit rows through the API, and migration 0150 revokes
//   the write grants from anon/authenticated outright.
// - Pass `scope.eventId` whenever the action concerns an event. The org is then
//   resolved from the event HERE (one lookup), and wins over any orgId the
//   caller passed — the row's org is never taken on trust.
// - `record_id` is uuid. A non-uuid entityId goes into new_data.entity_ref with
//   record_id null, so the insert never fails on it.
//
// Not `import 'server-only'`: this runs inside the Trigger.dev worker too
// (certificate-issue-sweep, issue-core), where that guard is not resolvable.
// It is server-side by construction — it needs SUPABASE_SERVICE_ROLE_KEY,
// which is never shipped to the browser.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export interface AuditScope {
  /** The event the action concerns. The row's org is resolved from it. */
  eventId?: string | null
}

export async function logAudit(
  _client: unknown,
  orgId: string | null,
  userId: string | null,
  action: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
  scope?: AuditScope,
): Promise<void> {
  try {
    const admin = createAdminClient()

    let rowOrgId = orgId
    let rowEventId: string | null = null
    const refs: Record<string, unknown> = {}

    const eventId = scope?.eventId ?? null
    if (eventId) {
      if (!isUuid(eventId)) {
        refs.event_ref = eventId
      } else {
        const { data: event, error: eventError } = await admin
          .from('events')
          .select('org_id')
          .eq('id', eventId)
          .maybeSingle()
        if (eventError || !event) {
          // Still write the row — an audit entry without its event link beats
          // no entry at all. The event id is kept in new_data for tracing.
          console.error('[audit] event lookup failed (non-fatal):', eventError?.message ?? 'event not found', { action, eventId })
          refs.event_ref = eventId
        } else {
          rowEventId = eventId
          const eventOrgId = (event as { org_id: string | null }).org_id
          if (orgId && eventOrgId && orgId !== eventOrgId) {
            console.error('[audit] caller orgId does not match the event org; using the event org', { action, eventId })
          }
          rowOrgId = eventOrgId ?? orgId
        }
      }
    }

    let recordId: string | null = null
    if (entityId) {
      if (isUuid(entityId)) recordId = entityId
      else refs.entity_ref = entityId
    }

    const newData = metadata || Object.keys(refs).length > 0
      ? { ...(metadata ?? {}), ...refs }
      : null

    const { error } = await admin.from('audit_logs').insert({
      org_id: rowOrgId,
      event_id: rowEventId,
      user_id: userId,
      action,
      table_name: entityType ?? null,
      record_id: recordId,
      new_data: newData,
    })

    // Logged, not thrown, not returned: callers treat auditing as fire-and-
    // forget and must keep doing so. `action` is included so a log line
    // identifies which call sites are affected.
    if (error) {
      console.error('[audit] insert failed (non-fatal):', error.message, { action })
    }
  } catch (e) {
    // A thrown error means the request never reached PostgREST at all (or the
    // admin client could not be constructed).
    console.error('[audit] insert threw (non-fatal):', e instanceof Error ? e.message : String(e), { action })
  }
}

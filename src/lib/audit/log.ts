import type { SupabaseClient } from '@supabase/supabase-js'

// Writes one row to the audit trail. Two guarantees, both kept: this never
// throws, and an audit failure never surfaces to the user. What changed is that
// a failure is no longer INVISIBLE.
//
// ── Why this function recorded nothing for the entire life of the project ────
// `audit_logs.action` was the Postgres enum `audit_action` (0001_initial_schema
// .sql:29) with nine members: create, update, delete, login, logout, checkin,
// register, payment, export. Every call site passes a DOTTED string —
// 'certificate.issue', 'org.create', 'checkin.self', ~35 of them — and not one
// is a member. Every insert failed with 22P02, and the table held zero rows.
//
// The old code looked like it handled that, and did not. postgrest-js does NOT
// throw on a constraint violation: `.insert()` RESOLVES with `{ error }`.
// There was no `.throwOnError()`, and the return value was never read — so the
// bare `catch` never fired even once. The failure was discarded by never being
// looked at, and the comment in that catch described an intent the code did not
// implement.
//
// That distinction is the whole point of this change. Migration 0146 widens the
// column to text and fixes the 35 values we know about; reading the error is
// what makes the NEXT break — a renamed column, a new NOT NULL, an RLS denial —
// show up in logs on the day it starts instead of being found by someone
// querying an empty table months later.
//
// The try/catch below stays, but it is now a backstop for a genuinely THROWN
// error (a network failure, a client constructed wrong) rather than the
// mechanism that hides everything.
export async function logAudit(
  supabase: SupabaseClient,
  orgId: string | null,
  userId: string | null,
  action: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      org_id: orgId,
      user_id: userId,
      action,
      table_name: entityType ?? null,
      record_id: entityId ? entityId as unknown as string : null,
      new_data: metadata ? metadata as unknown as Record<string, unknown> : null,
    })

    // Logged, not thrown, not returned: callers treat auditing as fire-and-
    // forget and must keep doing so. `action` is included because the failure
    // that mattered here was value-specific — a message without it would not
    // have told anyone which call sites were broken.
    if (error) {
      console.error('[audit] insert failed (non-fatal):', error.message, { action })
    }
  } catch (e) {
    // A thrown error means the request never reached PostgREST at all.
    console.error('[audit] insert threw (non-fatal):', e instanceof Error ? e.message : String(e), { action })
  }
}

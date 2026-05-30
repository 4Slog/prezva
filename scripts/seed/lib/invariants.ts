import type { SupabaseClient } from '@supabase/supabase-js'
import { log } from './logger'

export class InvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvariantError'
  }
}

/** Asserts post-run persona invariants (only meaningful after --execute). */
export async function assertPersonaInvariants(
  supabase: SupabaseClient,
  expectedProfileCount: number,
  preservedUserId: string,
): Promise<void> {
  const errs: string[] = []

  // 1. Profile count matches expected
  const { count, error: countErr } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
  if (countErr) {
    errs.push(`profiles count query failed: ${countErr.message}`)
  } else if (count !== expectedProfileCount) {
    errs.push(`profiles count: expected ${expectedProfileCount}, got ${count}`)
  }

  // 2. Preserved sowu.paul auth row is present and untouched
  const { data: preserved, error: preservedErr } = await supabase.auth.admin.getUserById(preservedUserId)
  if (preservedErr || !preserved?.user) {
    errs.push(`preserved auth user ${preservedUserId} not found`)
  }

  // 3. No orphan profiles (profile without a matching auth.users row)
  const { data: profiles, error: profilesErr } = await supabase
    .from('profiles')
    .select('id, email')
  if (profilesErr) {
    errs.push(`orphan check failed: ${profilesErr.message}`)
  } else if (profiles) {
    for (const p of profiles) {
      const { data: au, error: auErr } = await supabase.auth.admin.getUserById(p.id as string)
      if (auErr || !au?.user) {
        errs.push(`orphan profile: id=${p.id} email=${p.email} has no auth.users row`)
      }
    }
  }

  if (errs.length > 0) {
    for (const e of errs) log.error(`INVARIANT FAIL: ${e}`)
    throw new InvariantError(`${errs.length} invariant(s) failed — see above`)
  }

  log.ok('All persona invariants pass')
}

/** Lightweight pre-run check: only verifies sowu.paul's auth row exists. Safe in dry-run. */
export async function assertPreRunPreserved(
  supabase: SupabaseClient,
  preservedUserId: string,
): Promise<void> {
  const { data, error } = await supabase.auth.admin.getUserById(preservedUserId)
  if (error || !data?.user) {
    throw new InvariantError(
      `Pre-run check failed: preserved user ${preservedUserId} not found in auth.users. ` +
      `Run wipe stage first to understand the current state.`,
    )
  }
  log.ok(`Preserved user ${preservedUserId} (sowu.paul) is present`)
}

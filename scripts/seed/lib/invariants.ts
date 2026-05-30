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

/** Asserts post-run org invariants (only meaningful after --execute). */
export async function assertOrgInvariants(
  supabase: SupabaseClient,
  expectedOrgCount: number,
): Promise<void> {
  const errs: string[] = []

  // 1. Exactly N orgs exist (excluding soft-deleted)
  const { count: orgCount, error: orgCountErr } = await supabase
    .from('organizations')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)
  if (orgCountErr) {
    errs.push(`org count query failed: ${orgCountErr.message}`)
  } else if (orgCount !== expectedOrgCount) {
    errs.push(`org count: expected ${expectedOrgCount}, got ${orgCount}`)
  }

  // 2. Each org has exactly one owner
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name')
    .is('deleted_at', null)
  for (const org of orgs ?? []) {
    const { count: ownerCount, error: ownerErr } = await supabase
      .from('org_members')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', org.id)
      .eq('role', 'owner')
    if (ownerErr) {
      errs.push(`owner count for "${org.name}": ${ownerErr.message}`)
    } else if (ownerCount !== 1) {
      errs.push(`org "${org.name}": expected 1 owner, got ${ownerCount}`)
    }
  }

  // 3. Every org_members.user_id resolves to a profile
  const { data: members, error: membersErr } = await supabase
    .from('org_members')
    .select('user_id, org_id')
  if (membersErr) {
    errs.push(`org_members query failed: ${membersErr.message}`)
  } else {
    for (const m of members ?? []) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', m.user_id)
        .maybeSingle()
      if (!profile) {
        errs.push(`org_member user_id=${m.user_id} (org ${m.org_id}) has no matching profile`)
      }
    }
  }

  // 4. No duplicate (org_id, user_id) — double-check unique constraint is holding
  const { data: allMembers } = await supabase.from('org_members').select('org_id, user_id')
  if (allMembers) {
    const seen = new Set<string>()
    for (const m of allMembers) {
      const key = `${m.org_id}:${m.user_id}`
      if (seen.has(key)) errs.push(`duplicate org_member: org=${m.org_id} user=${m.user_id}`)
      seen.add(key)
    }
  }

  if (errs.length > 0) {
    for (const e of errs) log.error(`INVARIANT FAIL: ${e}`)
    throw new InvariantError(`${errs.length} org invariant(s) failed — see above`)
  }

  log.ok('All org invariants pass')
}

/** Asserts post-run event invariants (post-execute only). */
export async function assertEventInvariants(
  supabase: SupabaseClient,
  expectedEventCount: number,
): Promise<void> {
  const errs: string[] = []

  // 1. Exactly N events exist
  const { count: evtCount, error: evtErr } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
  if (evtErr) {
    errs.push(`event count query failed: ${evtErr.message}`)
  } else if (evtCount !== expectedEventCount) {
    errs.push(`event count: expected ${expectedEventCount}, got ${evtCount}`)
  }

  // 2. All event org_ids resolve to existing organizations
  const { data: events, error: evtsErr } = await supabase
    .from('events')
    .select('id, title, org_id')
  if (evtsErr) {
    errs.push(`events query failed: ${evtsErr.message}`)
  } else {
    for (const e of events ?? []) {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', e.org_id)
        .maybeSingle()
      if (!org) errs.push(`event "${e.title}" has unknown org_id ${e.org_id}`)
    }
  }

  // 3. No two events share the same (org_id, slug)
  const { data: allEvents } = await supabase.from('events').select('org_id, slug, title')
  if (allEvents) {
    const seen = new Set<string>()
    for (const e of allEvents) {
      const key = `${e.org_id}:${e.slug}`
      if (seen.has(key)) errs.push(`duplicate (org_id, slug): "${e.slug}" in org ${e.org_id}`)
      seen.add(key)
    }
  }

  if (errs.length > 0) {
    for (const e of errs) log.error(`INVARIANT FAIL: ${e}`)
    throw new InvariantError(`${errs.length} event invariant(s) failed — see above`)
  }
  log.ok('All event invariants pass')
}

/** Asserts post-run event-config invariants (post-execute only). */
export async function assertEventConfigInvariants(supabase: SupabaseClient): Promise<void> {
  const errs: string[] = []

  // 1. All session track_id and room_id refs resolve to existing records
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, title, track_id, room_id')
  for (const sn of sessions ?? []) {
    if (sn.track_id) {
      const { data: t } = await supabase.from('tracks').select('id').eq('id', sn.track_id).maybeSingle()
      if (!t) errs.push(`session "${sn.title}" has unknown track_id ${sn.track_id}`)
    }
    if (sn.room_id) {
      const { data: r } = await supabase.from('rooms').select('id').eq('id', sn.room_id).maybeSingle()
      if (!r) errs.push(`session "${sn.title}" has unknown room_id ${sn.room_id}`)
    }
  }

  // 2. All session_speakers.speaker_id refs resolve to speakers on the same event
  const { data: ssSpeakers } = await supabase
    .from('session_speakers')
    .select('session_id, speaker_id')
  if (ssSpeakers) {
    for (const ss of ssSpeakers) {
      // Get the event_id of the session, then verify speaker belongs to same event
      const { data: sn } = await supabase
        .from('sessions').select('event_id').eq('id', ss.session_id).maybeSingle()
      if (!sn) { errs.push(`session_speaker references unknown session ${ss.session_id}`); continue }
      const { data: sp } = await supabase
        .from('speakers').select('id, event_id').eq('id', ss.speaker_id).maybeSingle()
      if (!sp) { errs.push(`session_speaker references unknown speaker ${ss.speaker_id}`); continue }
      if (sp.event_id !== sn.event_id) {
        errs.push(`session_speaker: speaker ${ss.speaker_id} is on event ${sp.event_id} but session is on event ${sn.event_id}`)
      }
    }
  }

  // 3. CE sessions (ce_credit_hours > 0) only exist on events with certificate_enabled:true
  const { data: ceSessions } = await supabase
    .from('sessions')
    .select('id, title, event_id, ce_credit_hours')
    .gt('ce_credit_hours', 0)
  for (const sn of ceSessions ?? []) {
    const { data: ev } = await supabase
      .from('events').select('certificate_enabled, title').eq('id', sn.event_id).maybeSingle()
    if (ev && !ev.certificate_enabled) {
      errs.push(`session "${sn.title}" has ce_credit_hours > 0 but event "${ev.title}" has certificate_enabled:false`)
    }
  }

  if (errs.length > 0) {
    for (const e of errs) log.error(`INVARIANT FAIL: ${e}`)
    throw new InvariantError(`${errs.length} event-config invariant(s) failed — see above`)
  }
  log.ok('All event-config invariants pass')
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

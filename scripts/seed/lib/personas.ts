/**
 * Shared persona helper — used by all stages that need auth users.
 *
 * ensurePersona() is idempotent: safe to call multiple times for the same email.
 * In dry-run it performs only reads (to resolve existing IDs) and makes no writes.
 * Logging of actions happens inside this function (execute mode only).
 * In dry-run the caller is responsible for logging planned actions.
 */

import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { log } from './logger'

export type PersonaMode = 'preserved' | 'invite' | 'fixture'

export interface PersonaSpec {
  /** Required when mode='preserved' (e.g. sowu.paul whose auth row is never recreated). */
  id?: string
  email: string
  full_name: string
  job_title?: string
  company?: string
  mode: PersonaMode
}

export interface PersonaResult {
  profileId: string
  isNew: boolean
}

/**
 * Idempotently ensures a persona (auth.users + profiles) exists.
 *
 * Modes:
 *   'preserved' — upserts the profile by fixed id; never touches auth.users.
 *                 The auth row must already exist (e.g. sowu.paul survives wipes).
 *   'invite'    — uses generateLink(type='invite') for new users so the one-time
 *                 link is captured in seed output rather than relying on email delivery.
 *                 Generates a recovery link (not an invite) if the user already exists.
 *   'fixture'   — creates the auth user via admin.createUser with a per-run throwaway
 *                 password that is never stored, logged, or surfaced.
 *
 * Trigger awareness: trg_on_auth_user_created fires on every auth.users INSERT and
 * auto-inserts profiles(id, email, full_name, avatar_url). After that fires, this
 * function UPDATEs the profile to enrich it with job_title / company.
 * For 'preserved' mode the trigger has already fired (or will never fire again), so
 * we UPSERT the profile directly to safely handle both fresh and post-wipe states.
 *
 * Dry-run: no writes; resolves profileId via a read if persona already exists,
 * returns null otherwise (caller should log "would create").
 * Execute: returns the resolved profileId in all cases.
 */
export async function ensurePersona(
  supabase: SupabaseClient,
  spec: PersonaSpec,
  opts: { dryRun: boolean },
): Promise<PersonaResult | null> {

  // ── Preserved (sowu.paul) ────────────────────────────────────────────────────
  if (spec.mode === 'preserved') {
    if (!spec.id) {
      throw new Error(`ensurePersona: mode='preserved' requires spec.id (email: ${spec.email})`)
    }
    // Dry-run: ID is always known for preserved personas — return immediately.
    if (opts.dryRun) return { profileId: spec.id, isNew: false }

    const { error } = await supabase.from('profiles').upsert(
      {
        id:        spec.id,
        email:     spec.email,
        full_name: spec.full_name,
        job_title: spec.job_title ?? null,
        company:   spec.company   ?? null,
      },
      { onConflict: 'id' },
    )
    if (error) throw new Error(`ensurePersona preserved ${spec.email}: ${error.message}`)
    log.ok(`Profile upserted — ${spec.email} (preserved)`)
    return { profileId: spec.id, isNew: false }
  }

  // ── Invite + fixture: check existence first (idempotency) ────────────────────
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', spec.email)
    .maybeSingle()

  if (opts.dryRun) {
    // Read-only check — does this persona already exist?
    return existing?.id ? { profileId: existing.id as string, isNew: false } : null
  }

  // ── Invite ───────────────────────────────────────────────────────────────────
  if (spec.mode === 'invite') {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

    if (existing?.id) {
      await supabase
        .from('profiles')
        .update({
          full_name: spec.full_name,
          job_title: spec.job_title ?? null,
          company:   spec.company   ?? null,
        })
        .eq('id', existing.id)

      const { data: recovery, error: recErr } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: spec.email,
      })
      if (recErr) {
        log.warn(`Recovery link for ${spec.email}: ${recErr.message}`)
      } else if (recovery?.properties?.action_link) {
        log.ok(`${spec.email} already exists — profile updated`)
        log.link('Recovery link (set password)', recovery.properties.action_link)
      }
      return { profileId: existing.id as string, isNew: false }
    }

    const { data: invite, error: invErr } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email: spec.email,
      options: {
        data: { full_name: spec.full_name },
        redirectTo: `${appUrl}/onboarding`,
      },
    })
    if (invErr) throw new Error(`ensurePersona invite ${spec.email}: ${invErr.message}`)
    if (!invite?.user?.id) throw new Error(`ensurePersona invite ${spec.email}: no user.id in response`)

    // trg_on_auth_user_created has fired — enrich the auto-created profile
    await supabase
      .from('profiles')
      .update({ job_title: spec.job_title ?? null, company: spec.company ?? null })
      .eq('id', invite.user.id)

    log.ok(`Invited ${spec.email} (profile auto-populated by trigger)`)
    if (invite.properties?.action_link) {
      log.link('Invite link (one-time, set password)', invite.properties.action_link)
    }
    return { profileId: invite.user.id, isNew: true }
  }

  // ── Fixture ──────────────────────────────────────────────────────────────────
  if (existing?.id) {
    await supabase
      .from('profiles')
      .update({
        full_name: spec.full_name,
        job_title: spec.job_title ?? null,
        company:   spec.company   ?? null,
      })
      .eq('id', existing.id)
    return { profileId: existing.id as string, isNew: false }
  }

  // Throwaway password — generated per-run, never stored, logged, or surfaced.
  const throwawayPassword = randomBytes(32).toString('hex')
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email:         spec.email,
    password:      throwawayPassword,
    email_confirm: true,
    user_metadata: { full_name: spec.full_name },
  })
  if (createErr) throw new Error(`ensurePersona fixture ${spec.email}: ${createErr.message}`)
  if (!created?.user?.id) throw new Error(`ensurePersona fixture ${spec.email}: no user.id in response`)

  // Enrich the auto-created profile
  await supabase
    .from('profiles')
    .update({
      full_name: spec.full_name,
      job_title: spec.job_title ?? null,
      company:   spec.company   ?? null,
    })
    .eq('id', created.user.id)

  return { profileId: created.user.id, isNew: true }
}

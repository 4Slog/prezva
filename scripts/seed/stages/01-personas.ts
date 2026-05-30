/**
 * Stage 01 — Personas
 *
 * Creates tier-0 identities: the two heroes + N synthetic fixture users.
 * Guest registrations (no auth) are created later in stage 06 (registrations).
 *
 * TRIGGER AWARENESS:
 *   trg_on_auth_user_created fires AFTER INSERT on auth.users and inserts a
 *   profiles row (id, email, full_name, avatar_url). For sowu.paul his auth row
 *   persists through wipes but his profile row is gone — so stage 1 upserts the
 *   profile directly rather than relying on a re-fire. For all other new personas
 *   the trigger fires on their auth INSERT, then we UPDATE to enrich the profile.
 *   Net rule: upsert profiles keyed by id for everyone.
 *
 * trg_link_anon_regs NOTE:
 *   A second trigger (trg_link_anon_regs) fires AFTER INSERT on auth.users and
 *   back-fills registrations.user_id for any guest registration whose attendee_email
 *   matches the new user's email. Stage 1 runs before registrations exist, so it is
 *   safe here. Stage 06 (registrations) must be deliberate about guest-vs-logged-in
 *   email collisions: a synthetic fixture email used for both a guest reg AND an
 *   auth user will be auto-linked the moment the auth user is created.
 *
 * IDEMPOTENCY:
 *   All writes use upsert keyed by id (profiles) or detect existence by email
 *   (paul@prezva.app). Re-runs are safe; no duplicate rows are created.
 *
 * INVITE LINKS (--execute only):
 *   paul@prezva.app: generateLink({type:'invite'}) captures the set-password action
 *   link in seed output. If the user already exists, a recovery link is generated
 *   instead. Links are printed once and never stored.
 */

import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { log } from '../lib/logger'
import type { StageSummary } from '../lib/logger'

interface Hero {
  id?: string
  email: string
  full_name: string
  job_title?: string
  company?: string
}

interface PersonasData {
  heroes: Hero[]
  syntheticFixtureCount: number
}

interface PersonasPlan {
  sowuPaul: Hero & { id: string }
  invitedHeroes: Hero[]   // heroes without a pre-existing id (invited via auth)
  fixtureCount: number
}

function buildPlan(data: PersonasData): PersonasPlan {
  const sowuPaul = data.heroes.find(h => h.id === '43280c9b-60a7-4884-94b0-1c80e5af1a9d')
  if (!sowuPaul?.id) throw new Error('personas.json must contain sowu.paul hero with id field')

  const invitedHeroes = data.heroes.filter(h => !h.id)

  return {
    sowuPaul: sowuPaul as Hero & { id: string },
    invitedHeroes,
    fixtureCount: data.syntheticFixtureCount,
  }
}

/** Total profile rows we expect after this stage:
 *  1 (sowu.paul) + invited heroes + fixtures */
export function expectedProfileCount(data: PersonasData): number {
  return 1 + data.heroes.filter(h => !h.id).length + data.syntheticFixtureCount
  // sowu.paul is the only hero with a pre-existing id; all others get new auth rows
  // which also means +1 profile each. Plus fixtures.
  // Total = all heroes (sowu.paul + invited) + fixtures
}

export async function runPersonas(
  supabase: SupabaseClient,
  data: PersonasData,
  opts: { dryRun: boolean },
): Promise<StageSummary> {
  log.section('Stage 01: Personas')

  const plan = buildPlan(data)
  const totalPlanned =
    1 +                          // sowu.paul profile upsert
    plan.invitedHeroes.length +  // one auth+profile per invited hero
    plan.fixtureCount            // one auth+profile per fixture

  log.info(`Plan: 1 preserved hero upsert + ${plan.invitedHeroes.length} invited hero(s) + ${plan.fixtureCount} fixture(s)`)

  if (opts.dryRun) {
    log.dry(`upsert profile for sowu.paul (id ${plan.sowuPaul.id})`)
    for (const hero of plan.invitedHeroes) {
      log.dry(`invite ${hero.email} via generateLink(type='invite') → /onboarding`)
    }
    log.dry(`create ${plan.fixtureCount} synthetic fixture auth users (throwaway passwords, never stored)`)
    log.info('')
    log.ok(`Dry-run complete — no writes made`)
    return { stage: 'personas', planned: totalPlanned, actual: 0, note: 'dry-run' }
  }

  let actual = 0

  // ── sowu.paul: upsert his profile row (auth row already exists, trigger won't re-fire) ──────
  const { error: paulErr } = await supabase.from('profiles').upsert(
    {
      id:        plan.sowuPaul.id,
      email:     plan.sowuPaul.email,
      full_name: plan.sowuPaul.full_name,
      job_title: plan.sowuPaul.job_title ?? null,
      company:   plan.sowuPaul.company ?? null,
    },
    { onConflict: 'id' },
  )
  if (paulErr) throw new Error(`Failed to upsert sowu.paul profile: ${paulErr.message}`)
  log.ok(`Profile upserted for sowu.paul (${plan.sowuPaul.email})`)
  actual++

  // ── Invited heroes (e.g. paul@prezva.app): invite or recover ──────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

  for (const hero of plan.invitedHeroes) {
    // Check if this email already exists in profiles (i.e., auth user was already created)
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', hero.email)
      .maybeSingle()

    if (existing?.id) {
      // User already exists — update profile and optionally generate a recovery link
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ full_name: hero.full_name, job_title: hero.job_title ?? null, company: hero.company ?? null })
        .eq('id', existing.id)
      if (upErr) log.warn(`Profile update for ${hero.email}: ${upErr.message}`)

      // Generate a recovery link so Paul can still set/reset the password if needed
      const { data: recovery, error: recErr } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: hero.email,
      })
      if (recErr) {
        log.warn(`Could not generate recovery link for ${hero.email}: ${recErr.message}`)
      } else if (recovery?.properties?.action_link) {
        log.ok(`${hero.email} already exists — profile updated`)
        log.link('Recovery link (set password)', recovery.properties.action_link)
      }
    } else {
      // New user: generate invite link (creates auth.users row + fires profile trigger)
      const { data: invite, error: invErr } = await supabase.auth.admin.generateLink({
        type: 'invite',
        email: hero.email,
        options: {
          data: { full_name: hero.full_name },
          redirectTo: `${appUrl}/onboarding`,
        },
      })
      if (invErr) throw new Error(`Failed to invite ${hero.email}: ${invErr.message}`)

      // Trigger fires synchronously on auth INSERT — profile row now exists.
      // Enrich it with additional fields.
      if (invite?.user?.id) {
        const { error: enrichErr } = await supabase
          .from('profiles')
          .update({ job_title: hero.job_title ?? null, company: hero.company ?? null })
          .eq('id', invite.user.id)
        if (enrichErr) log.warn(`Profile enrich for ${hero.email}: ${enrichErr.message}`)
      }

      log.ok(`Invited ${hero.email} (auth user created, profile auto-populated by trigger)`)
      if (invite?.properties?.action_link) {
        log.link('Invite link (one-time, set password)', invite.properties.action_link)
      }
    }

    actual++
  }

  // ── Synthetic fixture users ────────────────────────────────────────────────────────────────────
  log.info(`Creating ${plan.fixtureCount} synthetic fixture user(s)...`)
  const fixtureNames = [
    'Alex Rivera', 'Jordan Kim', 'Morgan Chen', 'Casey Williams', 'Taylor Brooks',
    'Avery Johnson', 'Quinn Martinez', 'Blake Thompson', 'Reese Davis', 'Parker Wilson',
    'Drew Anderson', 'Sage Robinson', 'Cameron Harris', 'Drew Lee', 'Skyler Moore',
    'Harley Jackson', 'Rowan Thomas', 'Finley White', 'River Garcia', 'Emery Martinez',
  ]

  for (let i = 1; i <= plan.fixtureCount; i++) {
    const idx = (i - 1) % fixtureNames.length
    const email = `sowu.paul+fixture${String(i).padStart(3, '0')}@gmail.com`
    const full_name = fixtureNames[idx]

    // Check for existing fixture to stay idempotent
    const { data: existingFixture } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existingFixture?.id) {
      // Already exists — just update the profile
      await supabase
        .from('profiles')
        .update({ full_name })
        .eq('id', existingFixture.id)
      log.info(`  fixture ${String(i).padStart(3, '0')}: ${email} already exists, profile refreshed`)
    } else {
      // Generate a throwaway password — never logged, never stored, never used interactively.
      const throwawayPassword = randomBytes(32).toString('hex')

      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: throwawayPassword,
        email_confirm: true,
        user_metadata: { full_name },
      })
      if (createErr) {
        log.warn(`  fixture ${i}: ${email} — ${createErr.message}`)
        continue
      }

      // Trigger created the profile; enrich it
      if (created?.user?.id) {
        await supabase
          .from('profiles')
          .update({ full_name })
          .eq('id', created.user.id)
      }
      log.info(`  fixture ${String(i).padStart(3, '0')}: ${email} created`)
    }

    actual++
  }

  log.ok(`Stage 01 complete — ${actual}/${totalPlanned} persona(s) ready`)
  return { stage: 'personas', planned: totalPlanned, actual }
}

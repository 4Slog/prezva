/**
 * Stage 01 — Personas
 *
 * Creates tier-0 identities: the two heroes + N synthetic fixture users.
 * Guest registrations (no auth) are created later in stage 06 (registrations).
 *
 * All persona creation is delegated to ensurePersona() in lib/personas.ts.
 * See that module for trigger awareness, idempotency, and mode documentation.
 *
 * trg_link_anon_regs NOTE:
 *   A second trigger fires AFTER INSERT on auth.users and back-fills
 *   registrations.user_id for any guest reg whose attendee_email matches.
 *   Stage 01 runs before registrations exist — safe here.
 *   Stage 06 must be deliberate about guest-vs-logged-in email collisions.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ensurePersona, type PersonaSpec } from '../lib/personas'
import { log } from '../lib/logger'
import type { StageSummary } from '../lib/logger'

interface PersonasData {
  heroes: Array<{
    id?: string
    email: string
    full_name: string
    job_title?: string
    company?: string
  }>
  syntheticFixtureCount: number
}

/** Total profile rows expected after this stage runs on a fresh DB. */
export function expectedProfileCount(data: PersonasData): number {
  return data.heroes.length + data.syntheticFixtureCount
}

const FIXTURE_NAMES = [
  'Alex Rivera',    'Jordan Kim',    'Morgan Chen',   'Casey Williams',  'Taylor Brooks',
  'Avery Johnson',  'Quinn Martinez', 'Blake Thompson', 'Reese Davis',    'Parker Wilson',
  'Drew Anderson',  'Sage Robinson',  'Cameron Harris', 'Drew Lee',       'Skyler Moore',
  'Harley Jackson', 'Rowan Thomas',   'Finley White',   'River Garcia',   'Emery Martinez',
]

export async function runPersonas(
  supabase: SupabaseClient,
  data: PersonasData,
  opts: { dryRun: boolean },
): Promise<StageSummary> {
  log.section('Stage 01: Personas')

  const heroSpecs: PersonaSpec[] = data.heroes.map(h => ({
    ...h,
    mode: h.id ? ('preserved' as const) : ('invite' as const),
  }))

  const fixtureSpecs: PersonaSpec[] = Array.from({ length: data.syntheticFixtureCount }, (_, i) => ({
    email:     `sowu.paul+fixture${String(i + 1).padStart(3, '0')}@gmail.com`,
    full_name: FIXTURE_NAMES[i % FIXTURE_NAMES.length],
    mode:      'fixture' as const,
  }))

  const preservedCount = heroSpecs.filter(h => h.mode === 'preserved').length
  const invitedCount   = heroSpecs.filter(h => h.mode === 'invite').length
  const totalPlanned   = heroSpecs.length + fixtureSpecs.length

  log.info(`Plan: ${preservedCount} preserved + ${invitedCount} invited + ${data.syntheticFixtureCount} fixture(s)`)

  if (opts.dryRun) {
    for (const spec of heroSpecs) {
      if (spec.mode === 'preserved') {
        log.dry(`upsert profile for ${spec.email} (id ${spec.id})`)
      } else {
        log.dry(`invite ${spec.email} via generateLink(type='invite') → /onboarding`)
      }
    }
    log.dry(`create ${data.syntheticFixtureCount} synthetic fixture auth user(s) (throwaway passwords, never stored)`)
    log.info('')
    log.ok('Dry-run complete — no writes made')
    return { stage: 'personas', planned: totalPlanned, actual: 0, note: 'dry-run' }
  }

  let actual = 0

  for (const spec of heroSpecs) {
    await ensurePersona(supabase, spec, opts)
    actual++
  }

  log.info(`Creating ${data.syntheticFixtureCount} synthetic fixture user(s)...`)
  for (const spec of fixtureSpecs) {
    const result = await ensurePersona(supabase, spec, opts)
    if (result) {
      const action = result.isNew ? 'created' : 'refreshed'
      log.info(`  ${spec.email} — ${action}`)
    }
    actual++
  }

  log.ok(`Stage 01 complete — ${actual}/${totalPlanned} persona(s) ready`)
  return { stage: 'personas', planned: totalPlanned, actual }
}

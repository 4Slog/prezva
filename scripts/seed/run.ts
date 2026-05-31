#!/usr/bin/env node
/**
 * Golden Dataset Seed Runner
 *
 * Usage:
 *   pnpm seed --only=<stage[,stage]>   run specific stage(s)
 *   pnpm seed --all                    run all stages in order
 *   pnpm seed --only=personas          dry-run (default) — no writes
 *   pnpm seed --only=personas --execute  perform real writes
 *   pnpm seed --only=wipe --execute --confirm-wipe  DESTRUCTIVE wipe
 *
 * Flags:
 *   --only=<stage>      comma-separated stage names
 *   --all               run all stages in tier order
 *   --execute           opt-in to real writes (default: dry-run)
 *   --confirm-wipe      required to allow the wipe stage to proceed
 *
 * Default behavior is DRY-RUN: no database writes occur unless --execute is passed.
 */

import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSeedClient } from './lib/client'
import { log, printSummaryTable, type StageSummary } from './lib/logger'
import {
  assertPersonaInvariants, assertPreRunPreserved,
  assertOrgInvariants, assertEventInvariants, assertEventConfigInvariants,
  assertRegistrationInvariants, assertEngagementInvariants, assertImagesInvariants,
} from './lib/invariants'
import type { RegistrationsFileData } from './stages/05-registrations'
import type { EngagementFileData } from './stages/06-engagement'
import type { ImagesOrgData } from './stages/07-images'

// ─── CLI parsing ──────────────────────────────────────────────────────────────

const { values: flags } = parseArgs({
  options: {
    'only':          { type: 'string' },
    'all':           { type: 'boolean', default: false },
    'execute':       { type: 'boolean', default: false },
    'confirm-wipe':  { type: 'boolean', default: false },
    // --dry-run is accepted as a no-op alias (dry-run is already the default)
    'dry-run':       { type: 'boolean', default: false },
  },
  strict: false,
})

const dryRun     = !flags['execute']
const confirmWipe = !!flags['confirm-wipe']

// ─── Stage registry (tier order) ─────────────────────────────────────────────

const STAGES = [
  { name: 'wipe',     file: './stages/00-wipe' },
  { name: 'personas', file: './stages/01-personas' },
  { name: 'orgs',          file: './stages/02-orgs' },
  { name: 'events',        file: './stages/03-events' },
  { name: 'event-config',  file: './stages/04-event-config' },
  { name: 'registrations', file: './stages/05-registrations' },
  { name: 'engagement',    file: './stages/06-engagement' },
  { name: 'images',        file: './stages/07-images' },
] as const

type StageName = typeof STAGES[number]['name']

const STAGE_NAMES = STAGES.map(s => s.name)

// ─── Resolve which stages to run ─────────────────────────────────────────────

let stageNames: StageName[]

if (flags['all']) {
  stageNames = [...STAGE_NAMES]
} else if (typeof flags['only'] === 'string') {
  stageNames = flags['only'].split(',').map((s: string) => s.trim()) as StageName[]
  for (const name of stageNames) {
    if (!STAGE_NAMES.includes(name as StageName)) {
      log.error(`Unknown stage: "${name}"`)
      log.error(`Available stages: ${STAGE_NAMES.join(', ')}`)
      process.exit(1)
    }
  }
} else {
  log.error('Specify --only=<stage[,stage]> or --all')
  log.error(`Available stages: ${STAGE_NAMES.join(', ')}`)
  log.error('')
  log.error('Examples:')
  log.error('  pnpm seed --only=personas')
  log.error('  pnpm seed --only=personas --execute')
  log.error('  pnpm seed --all --execute')
  process.exit(1)
}

// ─── Banner ───────────────────────────────────────────────────────────────────

console.log('')
console.log('  ╔══════════════════════════════════════════════╗')
console.log(`  ║  Prezva Golden Dataset Seed Runner           ║`)
console.log(`  ║  Mode: ${dryRun ? '\x1b[33mDRY-RUN (no writes)\x1b[0m            ' : '\x1b[32mEXECUTE (live writes)\x1b[0m         '}  ║`)
console.log('  ╚══════════════════════════════════════════════╝')
console.log('')
log.info(`Stages to run: ${stageNames.join(', ')}`)
log.info(`Dry-run: ${dryRun}  |  Confirm-wipe: ${confirmWipe}`)
console.log('')

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const supabase = createSeedClient()
  const summaries: StageSummary[] = []

  // Load data files once — only what each stage needs
  const personasPath = join(__dirname, 'data', 'personas.json')
  const personasData: {
    heroes: Array<{ id?: string; email: string; full_name: string; job_title?: string; company?: string }>
    syntheticFixtureCount: number
  } = JSON.parse(readFileSync(personasPath, 'utf8'))

  const eventsPath = join(__dirname, 'data', 'events.json')
  const eventsData: import('./lib/event-types').EventsFileData =
    JSON.parse(readFileSync(eventsPath, 'utf8'))

  const regsPath = join(__dirname, 'data', 'registrations.json')
  const regsData: RegistrationsFileData = JSON.parse(readFileSync(regsPath, 'utf8'))

  const engPath = join(__dirname, 'data', 'engagement.json')
  const engData: EngagementFileData = JSON.parse(readFileSync(engPath, 'utf8'))

  const orgsPath = join(__dirname, 'data', 'orgs.json')
  const orgsData: {
    orgs: Array<{
      id: string
      name: string
      slug: string
      timezone: string
      description?: string
      website?: string
      email?: string
      city?: string
      state?: string
      country?: string
      members: Array<{
        id?: string
        email: string
        full_name: string
        job_title?: string
        company?: string
        mode: 'preserved' | 'invite' | 'fixture'
        role: 'owner' | 'admin' | 'staff'
      }>
    }>
  } = JSON.parse(readFileSync(orgsPath, 'utf8'))

  for (const stageName of stageNames) {
    // Safety check: wipe guard before even loading the stage module
    if (stageName === 'wipe' && dryRun) {
      log.warn('Skipping wipe stage — dry-run mode. Pass --execute --confirm-wipe to run for real.')
      summaries.push({ stage: 'wipe', planned: 0, actual: 0, note: 'skipped (dry-run)' })
      continue
    }

    if (stageName === 'wipe' && !confirmWipe) {
      log.warn('Skipping wipe stage — --confirm-wipe not passed.')
      summaries.push({ stage: 'wipe', planned: 0, actual: 0, note: 'skipped (no --confirm-wipe)' })
      continue
    }

    const stageEntry = STAGES.find(s => s.name === stageName)!

    try {
      if (stageName === 'wipe') {
        const { runWipe } = await import(stageEntry.file)
        const result = await runWipe(supabase, { dryRun, confirmWipe })
        summaries.push(result)

      } else if (stageName === 'personas') {
        // Pre-run: verify sowu.paul's auth row is present (safe in dry-run)
        const PRESERVED_UID = '43280c9b-60a7-4884-94b0-1c80e5af1a9d'
        await assertPreRunPreserved(supabase, PRESERVED_UID)

        const { runPersonas, expectedProfileCount } = await import(stageEntry.file)
        const result = await runPersonas(supabase, personasData, { dryRun })
        summaries.push(result)

        // Post-run invariants (only after real writes)
        if (!dryRun) {
          const expected = expectedProfileCount(personasData)
          await assertPersonaInvariants(supabase, expected, PRESERVED_UID)
        }

      } else if (stageName === 'orgs') {
        const { runOrgs } = await import(stageEntry.file)
        const result = await runOrgs(supabase, orgsData, { dryRun })
        summaries.push(result)

        if (!dryRun) {
          await assertOrgInvariants(supabase, orgsData.orgs.length)
        }

      } else if (stageName === 'events') {
        const { runEvents } = await import(stageEntry.file)
        const result = await runEvents(supabase, eventsData, { dryRun })
        summaries.push(result)

        if (!dryRun) {
          await assertEventInvariants(supabase, eventsData.events.length)
        }

      } else if (stageName === 'event-config') {
        const { runEventConfig } = await import(stageEntry.file)
        const result = await runEventConfig(supabase, eventsData, { dryRun })
        summaries.push(result)

        if (!dryRun) {
          await assertEventConfigInvariants(supabase)
        }

      } else if (stageName === 'registrations') {
        const { runRegistrations } = await import(stageEntry.file)
        const result = await runRegistrations(supabase, regsData, eventsData, { dryRun })
        summaries.push(result)

        if (!dryRun) {
          const eventSlugToId = new Map(eventsData.events.map(e => [e.slug, e.id]))
          await assertRegistrationInvariants(supabase, regsData, eventSlugToId)
        }

      } else if (stageName === 'engagement') {
        const { runEngagement } = await import(stageEntry.file)
        const result = await runEngagement(supabase, engData, eventsData, { dryRun })
        summaries.push(result)

        if (!dryRun) {
          const eventSlugToId = new Map(eventsData.events.map(e => [e.slug, e.id]))
          await assertEngagementInvariants(supabase, engData, eventsData, eventSlugToId)
        }

      } else if (stageName === 'images') {
        const { runImages } = await import(stageEntry.file)
        const imagesOrgsData: ImagesOrgData = { orgs: orgsData.orgs.map(o => ({ id: o.id, name: o.name })) }
        const result = await runImages(supabase, eventsData, imagesOrgsData, { dryRun })
        summaries.push(result)

        if (!dryRun) {
          await assertImagesInvariants(supabase, eventsData, imagesOrgsData)
        }
      }

    } catch (err) {
      log.error(`Stage "${stageName}" failed: ${err instanceof Error ? err.message : String(err)}`)
      printSummaryTable(summaries)
      process.exit(1)
    }
  }

  printSummaryTable(summaries)
  console.log('')
  log.ok('Seed runner finished.')
  console.log('')
}

main().catch(err => {
  log.error(`Unhandled error: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})

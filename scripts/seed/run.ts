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
import { assertPersonaInvariants, assertPreRunPreserved } from './lib/invariants'

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
  // Future stages: orgs, events, event-config, sessions, registrations, engagement, images
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

  // Load personas data once (needed for invariant expected counts)
  const personasPath = join(__dirname, 'data', 'personas.json')
  const personasData: {
    heroes: Array<{ id?: string; email: string; full_name: string; job_title?: string; company?: string }>
    syntheticFixtureCount: number
  } = JSON.parse(readFileSync(personasPath, 'utf8'))

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

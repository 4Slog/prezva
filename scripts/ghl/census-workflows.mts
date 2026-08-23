/**
 * Census instrument 1 — the workflow roster for one org's GHL location.
 *
 * Until now the census was a manual two-instrument procedure whose output was
 * read off a canvas and thrown away, so yesterday's run could bank a verdict
 * but not a baseline. This is that procedure as code: it prints the FULL
 * per-workflow table every run. The table is the artifact — a census that
 * prints only a verdict cannot be diffed against tomorrow's, which is the only
 * thing a baseline is for.
 *
 * Change detection is by ABSOLUTE updatedAt against a cutoff, not by relative
 * age: "updated in the last 24h" moves with the clock and silently reclassifies
 * the same row on a re-run, while ">= 2026-08-23T00:00:00Z" means the same
 * thing forever.
 *
 * Read-only: one GET. It never publishes, edits, or deletes a workflow.
 *
 * Run: pnpm tsx --env-file=.env.local scripts/ghl/census-workflows.mts <orgId> [cutoffISO]
 *
 * Exit codes: 0 = every Prezva workflow published, 1 = usage/link/token/API
 * failure or at least one Prezva workflow not in 'published' status.
 */
import { ghlAdapter } from '../../src/lib/integrations/ghl/adapter'
import { ghlGet } from '../../src/lib/integrations/ghl/client'
import { createAdminClient } from '../../src/lib/supabase/admin'

interface GhlWorkflow {
  id?: string
  name?: string
  status?: string
  version?: number
  updatedAt?: string
}

const orgId = process.argv[2]
if (!orgId) {
  console.error('usage: census-workflows.mts <orgId> [cutoffISO]')
  process.exit(1)
}

// Default cutoff is today at midnight UTC — the same boundary the manual
// procedure used, but stated absolutely so a re-run of this exact command
// tomorrow is a different, honest question rather than the same one drifting.
const cutoffArg = process.argv[3]
const cutoff = cutoffArg ?? `${new Date().toISOString().slice(0, 10)}T00:00:00Z`
if (Number.isNaN(Date.parse(cutoff))) {
  console.error(`CENSUS ${orgId} BAD_CUTOFF ${cutoff}`)
  process.exit(1)
}

const admin = createAdminClient()
const { data: link } = await admin
  .from('ghl_location_links')
  .select('ghl_location_id')
  .eq('org_id', orgId)
  .maybeSingle()

const locationId = link?.ghl_location_id as string | undefined
if (!locationId) {
  console.error(`CENSUS ${orgId} NO_LOCATION_LINK`)
  process.exit(1)
}

// A tokenless org is a hard stop. An empty workflow list printed here would be
// indistinguishable from "this location has no workflows", which is the
// opposite conclusion from "we could not look".
const token = await ghlAdapter.getAccessToken(orgId)
if (!token) {
  console.error(`CENSUS ${orgId} NO_TOKEN`)
  process.exit(1)
}

const res = await ghlGet<{ workflows?: GhlWorkflow[] }>(
  token,
  `/workflows/?locationId=${encodeURIComponent(locationId)}`,
)
const workflows = res.workflows ?? []

console.log(`CENSUS org=${orgId} location=${locationId} cutoff=${cutoff}`)
console.log(`TOTAL_WORKFLOWS ${workflows.length}\n`)

const sorted = [...workflows].sort((a, b) =>
  (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
)

console.log('ver  status      updatedAt                 SINCE?  name')
for (const w of sorted) {
  const since = (w.updatedAt ?? '') >= cutoff ? '*** YES' : '   no  '
  console.log(
    `${String(w.version ?? '?').padStart(3)}  ${String(w.status ?? '?').padEnd(10)}  ` +
      `${(w.updatedAt ?? '?').padEnd(24)}  ${since}  ${w.name ?? '(unnamed)'}`,
  )
}

const touched = workflows.filter((w) => (w.updatedAt ?? '') >= cutoff)
const published = workflows.filter((w) => w.status === 'published')
const draft = workflows.filter((w) => w.status === 'draft')

console.log(`\nTOUCHED_TODAY ${touched.length}`)
console.log(`PUBLISHED ${published.length}  DRAFT ${draft.length}`)

// The gate is name-scoped, not status-scoped: workflows this location's owner
// built themselves are none of our business, but anything carrying the Prezva
// name is ours and an unpublished one is a broken automation wearing our label.
const prezva = workflows.filter((w) => (w.name ?? '').startsWith('Prezva'))
const unpublished = prezva.filter((w) => w.status !== 'published')

console.log(`PREZVA_WORKFLOWS ${prezva.length}  PREZVA_UNPUBLISHED ${unpublished.length}`)
for (const w of unpublished) {
  console.log(`UNPUBLISHED ${w.status ?? '?'} "${w.name ?? '(unnamed)'}" id=${w.id ?? '?'}`)
}

if (unpublished.length > 0) {
  console.error(`CENSUS ${orgId} FAIL — ${unpublished.length} Prezva workflow(s) not published`)
  process.exit(1)
}

console.log(`CENSUS ${orgId} PASS`)

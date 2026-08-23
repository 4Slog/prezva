/**
 * R59 step 3 Part A — READ-ONLY probe of resolveWebhookSecret's early-return
 * inputs for one org. Mutates nothing: one Supabase SELECT, one GHL GET.
 *
 * Reproduces the exact predicate from provisioner.ts (`storedHash && found`)
 * against live inputs, and separately computes whether the stored hash actually
 * corresponds to the live Custom Value — a question the predicate does NOT ask.
 *
 * Temporary diagnostic, not for commit.
 * Run: pnpm tsx --env-file=.env.local scripts/ghl/probe-webhook-secret.mts <orgId>
 */
import { createHash } from 'node:crypto'
import { ghlAdapter } from '../../src/lib/integrations/ghl/adapter'
import { ghlListCustomValues } from '../../src/lib/integrations/ghl/client'
import { createAdminClient } from '../../src/lib/supabase/admin'

// Mirrored verbatim from provisioner.ts.
const WEBHOOK_SECRET_NAME = 'Prezva Webhook Secret'
const WEBHOOK_SECRET_SLUG = 'custom_values.prezva_webhook_secret'

const orgId = process.argv[2]
if (!orgId) {
  console.error('usage: probe-webhook-secret.mts <orgId>')
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
  console.error(`PROBE ${orgId} NO_LOCATION_LINK`)
  process.exit(1)
}

const token = await ghlAdapter.getAccessToken(orgId)
if (!token) {
  console.error(`PROBE ${orgId} NO_TOKEN`)
  process.exit(1)
}

const { data: existing } = await admin
  .from('ghl_org_config')
  .select('webhook_secret_hash')
  .eq('org_id', orgId)
  .maybeSingle()
const storedHash = (existing?.webhook_secret_hash as string | null | undefined) ?? null

const customValues = await ghlListCustomValues(token, locationId)
console.log(`CUSTOM_VALUES ${locationId} count=${customValues.length}`)
for (const cv of customValues) {
  console.log(`CV ${cv.id} name="${cv.name}" fieldKey="${cv.fieldKey ?? ''}" valueLen=${(cv.value ?? '').length}`)
}

// Same finder as the provisioner, same order of alternatives.
const found = customValues.find(
  (cv) => cv.name === WEBHOOK_SECRET_NAME || (cv.fieldKey ?? '').includes(WEBHOOK_SECRET_SLUG),
) ?? null

console.log(`STORED_HASH ${storedHash ?? 'NULL'}`)
console.log(`FOUND ${found ? `id=${found.id} name="${found.name}"` : 'NONE'}`)

if (found) {
  const liveHash = createHash('sha256').update(found.value ?? '', 'utf8').digest('hex')
  console.log(`LIVE_VALUE_SHA256 ${liveHash}`)
  console.log(`HASH_COMPARE ${storedHash === liveHash ? 'MATCH' : 'MISMATCH'}`)
} else {
  console.log('LIVE_VALUE_SHA256 N/A')
  console.log('HASH_COMPARE N/A')
}

// The predicate as written — deliberately not "is the pair consistent".
console.log(`EARLY_RETURN_WILL_FIRE ${Boolean(storedHash && found)}`)

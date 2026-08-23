/**
 * R59 step 2 — run the real provisioner against one org.
 *
 * MUTATES the tenant's GHL location: provisionGhlOrgConfig find-or-creates the
 * Events pipeline and every field in FIELD_DEFS, so any field missing from the
 * location gets CREATED. Then it upserts the resolved ids into ghl_org_config
 * itself — the caller does not write.
 *
 * provisionGhlOrgConfig returns void, so the "returned config" has to come from
 * re-reading the row it just wrote. That re-read is also the honest check: it
 * reports what actually landed in the database, not what we passed in.
 *
 * Run: pnpm tsx --env-file=.env.local scripts/ghl/run-provision.mts <orgId>
 */
import { ghlAdapter } from '../../src/lib/integrations/ghl/adapter'
import { provisionGhlOrgConfig } from '../../src/lib/integrations/ghl/provisioner'
import { createAdminClient } from '../../src/lib/supabase/admin'

const orgId = process.argv[2]
if (!orgId) {
  console.error('usage: run-provision.mts <orgId>')
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
  console.error(`PROVISION ${orgId} NO_LOCATION_LINK`)
  process.exit(1)
}

const token = await ghlAdapter.getAccessToken(orgId)
if (!token) {
  console.error(`PROVISION ${orgId} NO_TOKEN`)
  process.exit(1)
}

console.log(`PROVISION START org=${orgId} location=${locationId}`)
await provisionGhlOrgConfig(admin, token, orgId, locationId)
console.log(`PROVISION DONE org=${orgId}`)

const { data: row, error } = await admin
  .from('ghl_org_config')
  .select('org_id, pipeline_id, stage_ids, field_ids, calendar_id, provisioned_by, updated_at')
  .eq('org_id', orgId)
  .maybeSingle()

if (error || !row) {
  console.error(`PROVISION ${orgId} REREAD_FAILED`, error?.message ?? 'no row')
  process.exit(1)
}

console.log(JSON.stringify(row, null, 2))
const fieldIds = (row.field_ids ?? {}) as Record<string, string>
console.log(
  `FIELD_KEY_COUNT ${Object.keys(fieldIds).length}`,
  `prezvaEventName=${fieldIds.prezvaEventName ?? 'MISSING'}`,
  `prezvaCompletionDate=${fieldIds.prezvaCompletionDate ?? 'MISSING'}`,
)

/**
 * R59 step 2 — OBSERVE, never mutate.
 *
 * Reads the live custom-field list for one org's GHL location and prints the
 * slug (fieldKey) GHL actually assigned to every Prezva field. GHL derives the
 * slug from the display name by a rule we do not control and cannot reliably
 * predict ("Prezva Attendance %" became `opportunity.prezva_attendance_`), and
 * a certificate template can only merge a contact field BY SLUG — so the slug
 * GHL returns is the only authority. This script is the independent observer:
 * provisioner.ts's assertFieldKey is SILENT on a match AND silent when GHL
 * returns no fieldKey at all, so its quiet is not evidence of anything.
 *
 * Read-only: one GET. It never creates, updates, or provisions.
 *
 * Run: pnpm tsx --env-file=.env.local scripts/ghl/read-field-slugs.mts <orgId>
 *
 * Exit codes: 0 = slugs printed, 1 = usage/link/token/API failure.
 */
import { ghlAdapter } from '../../src/lib/integrations/ghl/adapter'
import { ghlGet } from '../../src/lib/integrations/ghl/client'
import { createAdminClient } from '../../src/lib/supabase/admin'

interface GhlField {
  id: string
  name?: string
  model?: string
  fieldKey?: string
}

const orgId = process.argv[2]
if (!orgId) {
  console.error('usage: read-field-slugs.mts <orgId>')
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
  console.log(`SLUGS ${orgId} NO_LOCATION_LINK`)
  process.exit(1)
}

// A tokenless org is a hard stop, not a quiet zero-field read: printing an
// empty field list here would look identical to "the location has no Prezva
// fields", which is the opposite conclusion.
const token = await ghlAdapter.getAccessToken(orgId)
if (!token) {
  console.log(`SLUGS ${orgId} NO_TOKEN`)
  process.exit(1)
}

const res = await ghlGet<{ customFields?: GhlField[] }>(
  token,
  `/locations/${encodeURIComponent(locationId)}/customFields?model=all`,
)

const prezva = (res.customFields ?? []).filter((f) => f.name?.startsWith('Prezva'))
for (const f of prezva) {
  console.log(`FIELD ${f.id} "${f.name}" [${f.model ?? ''}] key=${f.fieldKey ?? ''}`)
}

const slugOf = (name: string): string =>
  prezva.find((f) => f.name === name)?.fieldKey ?? 'MISSING'

console.log(`LOCATION ${orgId} ${locationId} prezvaFields=${prezva.length}`)
console.log(
  `SLUGS ${orgId} eventName=${slugOf('Prezva Event Name')} completionDate=${slugOf('Prezva Completion Date')}`,
)

import { randomBytes, createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ghlGet,
  ghlPost,
  ghlListCustomValues,
  ghlCreateCustomValue,
  ghlUpdateCustomValue,
} from './client'
import type { GhlCustomValue } from './client'
import type { GhlStageKey, GhlFieldKey } from './org-config'

const PIPELINE_NAME = 'Events'
const CALENDAR_NAME = 'Prezva Events'

// R55: the Custom Value that carries this location's webhook secret. The
// display name is what a human sees in GHL; WEBHOOK_SECRET_FIELD_KEY is the
// merge tag the snapshot's webhook action references, and GHL derives it by
// auto-slugging the display name — so the two must stay in lockstep. Renaming
// the display name silently changes the slug and breaks every snapshot.
const WEBHOOK_SECRET_NAME = 'Prezva Webhook Secret'
const WEBHOOK_SECRET_FIELD_KEY = '{{ custom_values.prezva_webhook_secret }}'
const WEBHOOK_SECRET_SLUG = 'custom_values.prezva_webhook_secret'

const STAGE_DEFS: Array<{ key: GhlStageKey; name: string; position: number }> = [
  { key: 'registered', name: 'Registered', position: 0 },
  { key: 'paymentPending', name: 'Payment Pending', position: 1 },
  { key: 'confirmed', name: 'Confirmed', position: 2 },
  { key: 'checkedIn', name: 'Checked In', position: 3 },
  { key: 'attendedSession', name: 'Attended Session', position: 4 },
  { key: 'noShow', name: 'No Show', position: 5 },
  { key: 'certificateIssued', name: 'Certificate Issued', position: 6 },
  { key: 'followUpComplete', name: 'Follow-Up Complete', position: 7 },
]

const STAGE_KEYS: GhlStageKey[] = STAGE_DEFS.map((s) => s.key)

type GhlFieldModel = 'contact' | 'opportunity'
type GhlFieldDataType = 'TEXT' | 'NUMERICAL' | 'DATE'

// expectFieldKey is set only on fields a GHL certificate template or workflow
// merges BY SLUG. GHL auto-slugs the display name and the result is not always
// predictable — "Prezva Attendance %" slugged to `opportunity.prezva_attendance_`,
// not `_pct` (see config.ts), which is why that field is referenced by ID only.
// A merge tag has no ID escape hatch, so for those fields the slug GHL actually
// returns is the only authority and we check it rather than assume it.
const FIELD_DEFS: Array<{
  key: GhlFieldKey
  name: string
  model: GhlFieldModel
  dataType: GhlFieldDataType
  expectFieldKey?: string
}> = [
  { key: 'prezvaEventId', name: 'Prezva Event ID', model: 'opportunity', dataType: 'TEXT' },
  { key: 'prezvaRegistrationId', name: 'Prezva Registration ID', model: 'opportunity', dataType: 'TEXT' },
  { key: 'prezvaTicketType', name: 'Prezva Ticket Type', model: 'opportunity', dataType: 'TEXT' },
  { key: 'prezvaPaymentStatus', name: 'Prezva Payment Status', model: 'opportunity', dataType: 'TEXT' },
  { key: 'prezvaSource', name: 'Prezva Source', model: 'opportunity', dataType: 'TEXT' },
  { key: 'prezvaLastSyncTime', name: 'Prezva Last Sync Time', model: 'opportunity', dataType: 'TEXT' },
  { key: 'prezvaCeCredits', name: 'Prezva CE Credits', model: 'opportunity', dataType: 'NUMERICAL' },
  { key: 'prezvaAttendancePct', name: 'Prezva Attendance %', model: 'opportunity', dataType: 'NUMERICAL' },
  { key: 'prezvaAttendeeLink', name: 'Prezva Attendee Link', model: 'contact', dataType: 'TEXT' },
  { key: 'prezvaEventDate', name: 'Prezva Event Date', model: 'contact', dataType: 'DATE' },
  // Certificate merge fields. TEXT, not DATE, for the completion date: the
  // rendered output stays under our control instead of depending on GHL's
  // undocumented date serializer. Both are merged by slug in the certificate
  // template, hence expectFieldKey.
  {
    key: 'prezvaEventName',
    name: 'Prezva Event Name',
    model: 'contact',
    dataType: 'TEXT',
    expectFieldKey: 'contact.prezva_event_name',
  },
  {
    key: 'prezvaCompletionDate',
    name: 'Prezva Completion Date',
    model: 'contact',
    dataType: 'TEXT',
    expectFieldKey: 'contact.prezva_completion_date',
  },
]

const FIELD_KEYS: GhlFieldKey[] = FIELD_DEFS.map((f) => f.key)

interface GhlPipelineStage {
  id: string
  name: string
  position?: number
}

interface GhlPipeline {
  id: string
  name: string
  stages: GhlPipelineStage[]
}

interface GhlPipelinesListResponse {
  pipelines: GhlPipeline[]
}

interface GhlPipelineCreateResponse {
  pipeline?: GhlPipeline
  traceId?: string
}

interface GhlCustomField {
  id: string
  name: string
  model: string
  dataType: string
  // GHL's auto-slug of the display name, returned on both list and create.
  // Optional because an older/partial response may omit it — an absent slug is
  // "unverifiable", never "mismatched".
  fieldKey?: string
}

interface GhlCustomFieldsListResponse {
  customFields: GhlCustomField[]
}

interface GhlCustomFieldCreateResponse {
  customField?: GhlCustomField
  field?: GhlCustomField
  id?: string
}

interface GhlCalendar {
  id: string
  name: string
}

interface GhlCalendarsListResponse {
  calendars: GhlCalendar[]
}

async function resolvePipeline(token: string, locationId: string): Promise<GhlPipeline> {
  const list = await ghlGet<GhlPipelinesListResponse>(
    token,
    `/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
  )
  const existing = list.pipelines?.find((p) => p.name === PIPELINE_NAME)
  if (existing) return existing

  const res = await ghlPost<GhlPipelineCreateResponse | GhlPipeline>(token, '/opportunities/pipelines', {
    name: PIPELINE_NAME,
    locationId,
    showInFunnel: true,
    showInPieChart: true,
    useOpportunityProbability: false,
    stages: STAGE_DEFS.map(({ name, position }) => ({
      name,
      position,
      showInFunnel: true,
      showInPieChart: true,
    })),
  })
  const pipeline = (res as GhlPipelineCreateResponse).pipeline ?? (res as GhlPipeline)
  if (!pipeline?.id) {
    throw new Error(
      `[ghl-provision] pipeline create returned no id — refusing to half-fire`,
    )
  }
  return pipeline
}

function resolveStageIds(pipeline: GhlPipeline, orgId: string): Record<GhlStageKey, string> {
  const stageIds = {} as Record<GhlStageKey, string>
  for (const def of STAGE_DEFS) {
    const stage = pipeline.stages?.find((s) => s.name === def.name)
    if (!stage) {
      throw new Error(
        `[ghl-provision] org ${orgId}: pipeline "${PIPELINE_NAME}" is missing stage "${def.name}" — refusing to half-fire`,
      )
    }
    stageIds[def.key] = stage.id
  }
  return stageIds
}

// Loud but NOT fatal, exactly like assertWebhookSecretFieldKey below and for
// the same reason: a slug mismatch means one merge tag in the certificate
// template renders empty — degraded, not broken — while throwing would abort
// the whole provisioning upsert and lose the pipeline and field IDs too, which
// is strictly worse. The log carries the ACTUAL slug so the template can be
// corrected by hand.
function assertFieldKey(orgId: string, def: { name: string; expectFieldKey?: string }, field: GhlCustomField): void {
  if (!def.expectFieldKey || !field.fieldKey) return
  if (field.fieldKey === def.expectFieldKey) return
  console.error(
    `[ghl-provision] org ${orgId}: field "${def.name}" has fieldKey "${field.fieldKey}", expected "${def.expectFieldKey}" — the certificate template's merge tag will not resolve; update the template to the actual slug`,
  )
}

async function resolveFieldIds(
  token: string,
  locationId: string,
  orgId: string,
): Promise<Record<GhlFieldKey, string>> {
  const list = await ghlGet<GhlCustomFieldsListResponse>(
    token,
    `/locations/${encodeURIComponent(locationId)}/customFields?model=all`,
  )
  const existingFields = list.customFields ?? []

  const fieldIds = {} as Record<GhlFieldKey, string>
  for (const def of FIELD_DEFS) {
    const existing = existingFields.find((f) => f.name === def.name && f.model === def.model)
    if (existing) {
      assertFieldKey(orgId, def, existing)
      fieldIds[def.key] = existing.id
      continue
    }

    const created = await ghlPost<GhlCustomFieldCreateResponse>(
      token,
      `/locations/${encodeURIComponent(locationId)}/customFields`,
      { name: def.name, dataType: def.dataType, model: def.model },
    )
    const field = created.customField ?? created.field ?? (created as unknown as GhlCustomField)
    if (!field?.id) {
      throw new Error(
        `[ghl-provision] org ${orgId}: create field "${def.name}" returned no id — refusing to half-fire`,
      )
    }
    assertFieldKey(orgId, def, field)
    fieldIds[def.key] = field.id
  }

  return fieldIds
}

// Find-only, no create branch: calendar notification config (booking
// confirmation, reminder, follow-up) is API-invisible — set in the GHL UI
// only — so a provisioner-created calendar would be a dead calendar with no
// notifications wired. The real "Prezva Events" calendar rides the snapshot
// pre-configured; this only adopts it by name.
async function resolveCalendarId(token: string, locationId: string): Promise<string | null> {
  const list = await ghlGet<GhlCalendarsListResponse>(
    token,
    `/calendars/?locationId=${encodeURIComponent(locationId)}`,
  )
  const existing = list.calendars?.find((c) => c.name === CALENDAR_NAME)
  return existing?.id ?? null
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

// GHL is inconsistent about the whitespace inside merge-tag braces
// ({{foo}} vs {{ foo }}), and that difference is cosmetic — stripping all
// whitespace compares what actually matters: the slug.
function normalizeMergeTag(tag: string): string {
  return tag.replace(/\s+/g, '')
}

function assertWebhookSecretFieldKey(orgId: string, cv: GhlCustomValue | null): void {
  if (!cv) return
  if (normalizeMergeTag(cv.fieldKey ?? '') === normalizeMergeTag(WEBHOOK_SECRET_FIELD_KEY)) return
  // Loud but NOT fatal. A slug mismatch means the snapshot's webhook action
  // resolves a different (or empty) merge tag, so that location will keep
  // authenticating on the global secret — degraded, not broken. Throwing here
  // would instead abort the whole provisioning upsert and lose the pipeline and
  // field IDs too, which is strictly worse.
  console.error(
    `[ghl-provision] org ${orgId}: webhook secret Custom Value fieldKey is "${cv.fieldKey}", expected "${WEBHOOK_SECRET_FIELD_KEY}" — the snapshot's merge tag will not resolve; this location stays on the global secret`,
  )
}

// R55: resolve this location's webhook secret, returning the sha256 hash to
// store — never the plaintext, which exists only in memory here and in the
// tenant's own GHL Custom Value.
//
// MINT DISCIPLINE — never rotate a working secret. Re-provisioning is a normal,
// repeatable event (both the OAuth callback and the embedded claim call this),
// so a fresh mint on every run would invalidate the live workflow's secret each
// time. We mint only when the pair is actually broken:
//   hash + value present  -> no writes at all, keep what works
//   value absent          -> mint + CREATE (nothing to preserve)
//   value present, hash absent -> mint + UPDATE (the plaintext is unrecoverable
//     from a hash by design, so we cannot re-derive the stored value — the only
//     way back to a consistent pair is a new secret on both sides)
//
// Returns null on any failure: the location simply stays on the global env
// secret, which still verifies while no hash is stored. Non-fatal by design —
// see the calendar precedent above.
async function resolveWebhookSecret(
  admin: SupabaseClient,
  token: string,
  orgId: string,
  locationId: string,
): Promise<string | null> {
  try {
    // Narrow select — deliberately not getGhlOrgConfig, which throws on any
    // incomplete stage/field map and would turn a half-provisioned org into a
    // provisioning failure instead of a missing secret.
    const { data: existing } = await admin
      .from('ghl_org_config')
      .select('webhook_secret_hash')
      .eq('org_id', orgId)
      .maybeSingle()

    const storedHash = (existing?.webhook_secret_hash as string | null | undefined) ?? null

    const customValues = await ghlListCustomValues(token, locationId)
    const found = customValues.find(
      (cv) =>
        cv.name === WEBHOOK_SECRET_NAME ||
        (cv.fieldKey ?? '').includes(WEBHOOK_SECRET_SLUG),
    ) ?? null

    if (storedHash && found) return storedHash

    const secret = randomBytes(32).toString('hex')

    if (!found) {
      const created = await ghlCreateCustomValue(token, locationId, WEBHOOK_SECRET_NAME, secret)
      assertWebhookSecretFieldKey(orgId, created)
    } else {
      const updated = await ghlUpdateCustomValue(token, locationId, found.id, WEBHOOK_SECRET_NAME, secret)
      assertWebhookSecretFieldKey(orgId, updated)
    }

    return sha256Hex(secret)
  } catch (e) {
    console.error(
      `[ghl-provision] org ${orgId}: webhook secret resolution failed — location stays on the global secret:`,
      e instanceof Error ? e.message : String(e),
    )
    return null
  }
}

function assertComplete(
  orgId: string,
  stageIds: Record<GhlStageKey, string>,
  fieldIds: Record<GhlFieldKey, string>,
): void {
  for (const key of STAGE_KEYS) {
    if (!stageIds[key]) {
      throw new Error(`[ghl-provision] org ${orgId}: resolved stage_ids is missing key "${key}" — refusing to half-fire`)
    }
  }
  for (const key of FIELD_KEYS) {
    if (!fieldIds[key]) {
      throw new Error(`[ghl-provision] org ${orgId}: resolved field_ids is missing key "${key}" — refusing to half-fire`)
    }
  }
}

// GE-8 Batch 3: find-or-create the "Events" pipeline (8 stages) and the 12
// Prezva custom fields for one location, then upsert the resolved IDs into
// ghl_org_config. Detect-by-name throughout so a re-run resolves the same
// IDs instead of duplicating pipelines/fields. Never upserts a partial map —
// any unresolved key aborts before the write.
export async function provisionGhlOrgConfig(
  admin: SupabaseClient,
  token: string,
  orgId: string,
  locationId: string,
): Promise<void> {
  const pipeline = await resolvePipeline(token, locationId)
  const stageIds = resolveStageIds(pipeline, orgId)
  const fieldIds = await resolveFieldIds(token, locationId, orgId)
  // A null calendar is NOT a provisioning failure — it never joins
  // assertComplete's all-or-throw check, and the conditional spread below
  // means a null here can never clobber a manually seeded calendar_id on re-provision.
  const calendarId = await resolveCalendarId(token, locationId)

  assertComplete(orgId, stageIds, fieldIds)

  // R55. After assertComplete so a location that cannot be fully provisioned
  // never gets a secret minted for it, and before the upsert so the hash lands
  // in the same write as everything else.
  const webhookSecretHash = await resolveWebhookSecret(admin, token, orgId, locationId)

  await admin.from('ghl_org_config').upsert(
    {
      org_id: orgId,
      pipeline_id: pipeline.id,
      stage_ids: stageIds,
      field_ids: fieldIds,
      provisioned_by: 'oauth-provisioner',
      ...(calendarId ? { calendar_id: calendarId } : {}),
      // Same conditional-spread discipline as calendar_id, and load-bearing for
      // the same reason: a null here means "resolution failed", never "clear the
      // stored hash". Clobbering it would silently re-open the global-secret
      // fallback for a location that had already closed that door.
      ...(webhookSecretHash ? { webhook_secret_hash: webhookSecretHash } : {}),
    },
    { onConflict: 'org_id' },
  )
}

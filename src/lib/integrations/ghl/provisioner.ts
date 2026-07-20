import type { SupabaseClient } from '@supabase/supabase-js'
import { ghlGet, ghlPost } from './client'
import type { GhlStageKey, GhlFieldKey } from './org-config'

const PIPELINE_NAME = 'Events'

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
type GhlFieldDataType = 'TEXT' | 'NUMERICAL'

const FIELD_DEFS: Array<{ key: GhlFieldKey; name: string; model: GhlFieldModel; dataType: GhlFieldDataType }> = [
  { key: 'prezvaEventId', name: 'Prezva Event ID', model: 'opportunity', dataType: 'TEXT' },
  { key: 'prezvaRegistrationId', name: 'Prezva Registration ID', model: 'opportunity', dataType: 'TEXT' },
  { key: 'prezvaTicketType', name: 'Prezva Ticket Type', model: 'opportunity', dataType: 'TEXT' },
  { key: 'prezvaPaymentStatus', name: 'Prezva Payment Status', model: 'opportunity', dataType: 'TEXT' },
  { key: 'prezvaSource', name: 'Prezva Source', model: 'opportunity', dataType: 'TEXT' },
  { key: 'prezvaLastSyncTime', name: 'Prezva Last Sync Time', model: 'opportunity', dataType: 'TEXT' },
  { key: 'prezvaCeCredits', name: 'Prezva CE Credits', model: 'opportunity', dataType: 'NUMERICAL' },
  { key: 'prezvaAttendancePct', name: 'Prezva Attendance %', model: 'opportunity', dataType: 'NUMERICAL' },
  { key: 'prezvaAttendeeLink', name: 'Prezva Attendee Link', model: 'contact', dataType: 'TEXT' },
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
}

interface GhlCustomFieldsListResponse {
  customFields: GhlCustomField[]
}

interface GhlCustomFieldCreateResponse {
  customField?: GhlCustomField
  field?: GhlCustomField
  id?: string
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
    fieldIds[def.key] = field.id
  }

  return fieldIds
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

// GE-8 Batch 3: find-or-create the "Events" pipeline (8 stages) and the 9
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

  assertComplete(orgId, stageIds, fieldIds)

  await admin.from('ghl_org_config').upsert(
    {
      org_id: orgId,
      pipeline_id: pipeline.id,
      stage_ids: stageIds,
      field_ids: fieldIds,
      provisioned_by: 'oauth-provisioner',
    },
    { onConflict: 'org_id' },
  )
}

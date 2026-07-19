import type { SupabaseClient } from '@supabase/supabase-js'

// Canonical home for the org-agnostic tag vocabulary — moved here (out of
// config.ts) so config.ts can import buildStageTagMaps from this module
// without a circular dependency; config.ts re-exports these unchanged so
// every existing `from '@/lib/integrations/ghl/config'` import keeps working.
export const GHL_TAG_PREFIX = 'prezva' as const

export function buildEventTag(eventSlug: string): string {
  return `${GHL_TAG_PREFIX}-event-${eventSlug}`
}

export const GHL_LIFECYCLE_TAGS = {
  confirmed:    `${GHL_TAG_PREFIX}-confirmed`,
  checkedIn:    `${GHL_TAG_PREFIX}-checked-in`,
  attended:     `${GHL_TAG_PREFIX}-attended`,
  noShow:       `${GHL_TAG_PREFIX}-no-show`,
  certIssued:   `${GHL_TAG_PREFIX}-cert-issued`,
  ceIncomplete: `${GHL_TAG_PREFIX}-ce-incomplete`,
} as const

export type GhlStageKey =
  | 'registered'
  | 'paymentPending'
  | 'confirmed'
  | 'checkedIn'
  | 'attendedSession'
  | 'noShow'
  | 'certificateIssued'
  | 'followUpComplete'

export type GhlFieldKey =
  | 'prezvaEventId'
  | 'prezvaRegistrationId'
  | 'prezvaTicketType'
  | 'prezvaPaymentStatus'
  | 'prezvaSource'
  | 'prezvaLastSyncTime'
  | 'prezvaAttendeeLink'
  | 'prezvaCeCredits'
  | 'prezvaAttendancePct'

export interface GhlOrgConfig {
  pipelineId: string
  stageIds: Record<GhlStageKey, string>
  fieldIds: Record<GhlFieldKey, string>
  stageTags: Record<string, string>
  stageSupersedesTags: Record<string, string[]>
}

const STAGE_KEYS: GhlStageKey[] = [
  'registered', 'paymentPending', 'confirmed', 'checkedIn',
  'attendedSession', 'noShow', 'certificateIssued', 'followUpComplete',
]

const FIELD_KEYS: GhlFieldKey[] = [
  'prezvaEventId', 'prezvaRegistrationId', 'prezvaTicketType', 'prezvaPaymentStatus',
  'prezvaSource', 'prezvaLastSyncTime', 'prezvaAttendeeLink', 'prezvaCeCredits', 'prezvaAttendancePct',
]

// Maps a pipeline stage id to the lifecycle tag applied on entering that
// stage, and to the tags superseded (removed) on entering it. Pure function
// of stageIds so both the legacy single-tenant constants (config.ts) and the
// per-org resolved config (getGhlOrgConfig) derive identical maps from one
// place — stages absent from stageTags intentionally apply no tag.
export function buildStageTagMaps(stageIds: Record<GhlStageKey, string>): {
  stageTags: Record<string, string>
  stageSupersedesTags: Record<string, string[]>
} {
  const stageTags: Record<string, string> = {
    [stageIds.confirmed]:         GHL_LIFECYCLE_TAGS.confirmed,
    [stageIds.checkedIn]:         GHL_LIFECYCLE_TAGS.checkedIn,
    [stageIds.attendedSession]:   GHL_LIFECYCLE_TAGS.attended,
    [stageIds.noShow]:            GHL_LIFECYCLE_TAGS.noShow,
    [stageIds.certificateIssued]: GHL_LIFECYCLE_TAGS.certIssued,
  }

  const stageSupersedesTags: Record<string, string[]> = {
    [stageIds.checkedIn]:         [GHL_LIFECYCLE_TAGS.noShow],
    [stageIds.attendedSession]:   [GHL_LIFECYCLE_TAGS.noShow],
    [stageIds.certificateIssued]: [GHL_LIFECYCLE_TAGS.noShow, GHL_LIFECYCLE_TAGS.ceIncomplete],
  }

  return { stageTags, stageSupersedesTags }
}

// Resolves one org's GHL pipeline/stage/field IDs from ghl_org_config. No
// caching layer in this batch — per-call SELECT is intentional for now.
export async function getGhlOrgConfig(admin: SupabaseClient, orgId: string): Promise<GhlOrgConfig | null> {
  const { data } = await admin
    .from('ghl_org_config')
    .select('pipeline_id, stage_ids, field_ids')
    .eq('org_id', orgId)
    .maybeSingle()

  if (!data) return null

  const stageIds = data.stage_ids as Record<string, string>
  const fieldIds = data.field_ids as Record<string, string>

  for (const key of STAGE_KEYS) {
    if (!stageIds[key]) {
      throw new Error(`[ghl] org ${orgId} ghl_org_config is missing stage key "${key}" — refusing to half-fire`)
    }
  }
  for (const key of FIELD_KEYS) {
    if (!fieldIds[key]) {
      throw new Error(`[ghl] org ${orgId} ghl_org_config is missing field key "${key}" — refusing to half-fire`)
    }
  }

  const typedStageIds = stageIds as Record<GhlStageKey, string>
  const { stageTags, stageSupersedesTags } = buildStageTagMaps(typedStageIds)

  return {
    pipelineId: data.pipeline_id as string,
    stageIds: typedStageIds,
    fieldIds: fieldIds as Record<GhlFieldKey, string>,
    stageTags,
    stageSupersedesTags,
  }
}

import { buildStageTagMaps, GHL_TAG_PREFIX, buildEventTag, GHL_LIFECYCLE_TAGS } from './org-config'

// Re-exported unchanged — canonical definitions live in org-config.ts (see
// comment there) purely to keep this module's dependency on org-config.ts
// one-directional. Every existing `from '@/lib/integrations/ghl/config'`
// import of these three keeps working without changes.
export { GHL_TAG_PREFIX, buildEventTag, GHL_LIFECYCLE_TAGS }

export function isGhlEventsEnabled(): boolean {
  return process.env.GHL_EVENTS_ENABLED === 'true'
}

// LEGACY SINGLE-TENANT CONSTANTS — seed/test reference only. Production code
// resolves via getGhlOrgConfig (GE-8 Batch 1). Do not import from production code.
export const GHL_EVENTS_PIPELINE_ID = 'oTf46hAR05Cnms51VGeC';

// LEGACY SINGLE-TENANT CONSTANTS — seed/test reference only. Production code
// resolves via getGhlOrgConfig (GE-8 Batch 1). Do not import from production code.
export const GHL_STAGE_IDS = {
  registered: 'd08d5780-342c-4a09-9cbf-7c0ab80eb4af',
  paymentPending: '5e0e12f8-6784-4293-94e5-39aeb3be66a5',
  confirmed: 'e847ee8a-4296-4563-aa24-e6e89d99b844',
  checkedIn: '3c092619-1b13-48bd-83a2-d9f1e616e46f',
  attendedSession: '0ea76af1-8a73-4fa1-bd2d-0e71f36b2411',
  noShow: 'cbfcb165-c227-4e1c-ae22-6d2cd8b9856c',
  certificateIssued: '8c559023-3634-47cb-b111-6827254bf9b6',
  followUpComplete: '5e067088-7278-44c4-9da6-3d09b350a96b',
} as const;

// LEGACY SINGLE-TENANT CONSTANTS — seed/test reference only. Production code
// resolves via getGhlOrgConfig (GE-8 Batch 1). Do not import from production code.
export const GHL_FIELD_KEYS = {
  prezvaEventId: 'pZB1j7QMFIFzlvmbE4Om',
  prezvaRegistrationId: 'xgwB65VeroEozIlRNyFS',
  prezvaTicketType: 'kDw7hGlT9kp7lZbFLfLb',
  prezvaPaymentStatus: '6fyY04s1yyTmpic653C0',
  prezvaSource: 'NfkhHIBJc3Etvq15iQnl',
  prezvaLastSyncTime: 'bYbFHamdFhi4apJXhP9t',
  // Contact field — written by payment webhook so GHL workflows can link attendees back
  prezvaAttendeeLink: 'GVx9yhZDVIkPChx7E5lp',
  // Opportunity fields, provisioned 2026-06-30 by the golden-dataset seed. GHL
  // auto-slugged Attendance %'s key to `opportunity.prezva_attendance_` (not
  // `_pct`) — the slug is unusable, so both fields MUST be referenced by ID.
  prezvaCeCredits: '4mYrFTnrQvdMUQ19LMSt',
  prezvaAttendancePct: 'jN0w8V3yMDLQaIJcp5pO',
} as const;

// Derived from the legacy constants via the same pure function production
// code uses for per-org config (buildStageTagMaps in org-config.ts), so
// these can't drift from what getGhlOrgConfig produces for a real org.
const LEGACY_STAGE_TAG_MAPS = buildStageTagMaps(GHL_STAGE_IDS)

// Maps a pipeline stage id to the lifecycle tag applied on entering that stage.
// Stages absent from this map intentionally apply no tag.
export const GHL_STAGE_TAGS: Record<string, string> = LEGACY_STAGE_TAG_MAPS.stageTags

// Entering these stages falsifies the no-show inference, so its tag is removed.
// One-directional by design: noShow never strips positive-fact tags.
export const GHL_STAGE_SUPERSEDES_TAGS: Record<string, string[]> = LEGACY_STAGE_TAG_MAPS.stageSupersedesTags

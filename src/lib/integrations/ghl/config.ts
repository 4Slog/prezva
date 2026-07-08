export function isGhlEventsEnabled(): boolean {
  return process.env.GHL_EVENTS_ENABLED === 'true'
}

export const GHL_EVENTS_PIPELINE_ID = 'oTf46hAR05Cnms51VGeC';

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

export const GHL_FIELD_KEYS = {
  prezvaEventId: 'pZB1j7QMFIFzlvmbE4Om',
  prezvaRegistrationId: 'xgwB65VeroEozIlRNyFS',
  prezvaTicketType: 'kDw7hGlT9kp7lZbFLfLb',
  prezvaPaymentStatus: '6fyY04s1yyTmpic653C0',
  prezvaSource: 'NfkhHIBJc3Etvq15iQnl',
  prezvaLastSyncTime: 'bYbFHamdFhi4apJXhP9t',
  // Contact field — written by payment webhook so GHL workflows can link attendees back
  prezvaAttendeeLink: 'GVx9yhZDVIkPChx7E5lp',
} as const;

export const GHL_TAG_PREFIX = 'prezva' as const

export function buildEventTag(eventSlug: string): string {
  return `${GHL_TAG_PREFIX}-event-${eventSlug}`
}

export const GHL_LIFECYCLE_TAGS = {
  confirmed:  `${GHL_TAG_PREFIX}-confirmed`,
  checkedIn:  `${GHL_TAG_PREFIX}-checked-in`,
  noShow:     `${GHL_TAG_PREFIX}-no-show`,
  certIssued: `${GHL_TAG_PREFIX}-cert-issued`,
} as const

// Maps a pipeline stage id to the lifecycle tag applied on entering that stage.
// Stages absent from this map intentionally apply no tag.
export const GHL_STAGE_TAGS: Record<string, string> = {
  [GHL_STAGE_IDS.confirmed]:         GHL_LIFECYCLE_TAGS.confirmed,
  [GHL_STAGE_IDS.checkedIn]:         GHL_LIFECYCLE_TAGS.checkedIn,
  [GHL_STAGE_IDS.noShow]:            GHL_LIFECYCLE_TAGS.noShow,
  [GHL_STAGE_IDS.certificateIssued]: GHL_LIFECYCLE_TAGS.certIssued,
}

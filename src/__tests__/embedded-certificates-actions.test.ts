import { describe, it, expect, vi, beforeEach } from 'vitest'

// R61. The regression this file exists for: certificates issued through the
// GHL-embedded door never wrote back to GHL and never emailed the attendee.
// Both doors now call issueCertificateCore, but "both doors call it" is only
// true until someone edits one of them — so these tests drive the REAL exported
// embed action, through its real guards, rather than calling the core directly.
// Testing the core here would prove the core works and prove nothing about the
// door, which is exactly the gap that let this ship broken for weeks.

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'fake-embed-token' }) }),
}))
vi.mock('@/lib/embedded/session', () => ({
  verifyEmbeddedSession: vi.fn().mockResolvedValue({ location_id: 'loc_1' }),
  COOKIE_NAME: 'embed_session',
}))
vi.mock('@/lib/certificates/eligibility', () => ({
  checkEligibility: vi.fn(),
}))
vi.mock('@/lib/trigger', () => ({
  enqueueCertificateEmail: vi.fn().mockResolvedValue(null),
  enqueueGhlStageMove: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/audit/log', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/notifications/notification-actions', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/integrations/ghl/location', () => ({
  ghlLocationIdForOrg: vi.fn(),
}))
// Partial mock: keep the real buildStageTagMaps (config.ts calls it at module
// load) and only stub getGhlOrgConfig, which this test controls directly.
vi.mock('@/lib/integrations/ghl/org-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/ghl/org-config')>()
  return { ...actual, getGhlOrgConfig: vi.fn() }
})
// Bare factory: the real adapter pulls in token encryption at module load.
vi.mock('@/lib/integrations/ghl/adapter', () => ({
  ghlAdapter: { getAccessToken: vi.fn() },
}))
// Partial mock, deliberately — same reasoning as certificates-actions.test.ts:
// a bare factory would leave any client export issue-core.ts imports but this
// file forgot to list as undefined, and the GHL block's catch would swallow the
// resulting TypeError. Green test, dead write in production.
vi.mock('@/lib/integrations/ghl/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/ghl/client')>()
  return { ...actual, ghlPut: vi.fn() }
})

let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

import { embedIssueOrGetCertificate } from '@/lib/embedded/certificates-actions'
import { checkEligibility } from '@/lib/certificates/eligibility'
import { enqueueCertificateEmail, enqueueGhlStageMove } from '@/lib/trigger'
import { logAudit } from '@/lib/audit/log'
import { ghlLocationIdForOrg } from '@/lib/integrations/ghl/location'
import { getGhlOrgConfig, type GhlOrgConfig } from '@/lib/integrations/ghl/org-config'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { ghlPut } from '@/lib/integrations/ghl/client'
import {
  GHL_STAGE_IDS,
  GHL_EVENTS_PIPELINE_ID,
  GHL_FIELD_KEYS,
  GHL_STAGE_TAGS,
  GHL_STAGE_SUPERSEDES_TAGS,
} from '@/lib/integrations/ghl/config'

const LOCATION_ID = '4KrDX2FYA2XZ68q88rFS'
const EVENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const REG_ID = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const ORG_ID = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const TEMPLATE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5f'
const CONTACT_ID = 'ghl-contact-1'
const SYNC_STATE_ID = 'sync-state-1'

const SAUP_CONFIG: GhlOrgConfig = {
  pipelineId: GHL_EVENTS_PIPELINE_ID,
  stageIds: GHL_STAGE_IDS,
  fieldIds: GHL_FIELD_KEYS as GhlOrgConfig['fieldIds'],
  stageTags: GHL_STAGE_TAGS,
  stageSupersedesTags: GHL_STAGE_SUPERSEDES_TAGS,
  calendarId: null,
}

const CERT_FIELD_IDS = {
  prezvaEventName: 'field-event-name',
  prezvaCompletionDate: 'field-completion-date',
}

const CONFIG_WITH_CERT_FIELDS: GhlOrgConfig = {
  ...SAUP_CONFIG,
  fieldIds: { ...SAUP_CONFIG.fieldIds, ...CERT_FIELD_IDS } as GhlOrgConfig['fieldIds'],
}

// end_at is 8pm March 14 in America/New_York — already March 15 in UTC.
// The embed's OLD registration select carried neither end_at nor timezone, so
// a straight copy of the dashboard's GHL block into the embed file would have
// produced a null completion date here and silently dropped the field.
const mockReg = {
  id: REG_ID,
  event_id: EVENT_ID,
  user_id: null,
  attendee_name: 'Alice',
  attendee_email: 'alice@test.com',
  events: {
    org_id: ORG_ID,
    title: 'Test Event',
    slug: 'test-event',
    end_at: '2026-03-15T00:00:00Z',
    timezone: 'America/New_York',
  },
}

const EXPECTED_COMPLETION_DATE = 'March 14, 2026'
const mockNewCert = { id: 'cert-1', registration_id: REG_ID }

function makeChain(override: Record<string, any> = {}) {
  const base: Record<string, any> = {}
  for (const k of ['select', 'insert', 'eq', 'update']) {
    base[k] = vi.fn().mockReturnThis()
  }
  base.single = vi.fn()
  base.maybeSingle = vi.fn()
  for (const k of Object.keys(override)) base[k] = override[k]
  return base
}

describe('embedIssueOrGetCertificate — the GHL half the embed door never had', () => {
  let certChain: Record<string, any>
  let regChain: Record<string, any>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ghlLocationIdForOrg).mockResolvedValue(LOCATION_ID)
    vi.mocked(getGhlOrgConfig).mockResolvedValue(CONFIG_WITH_CERT_FIELDS)
    vi.mocked(ghlAdapter.getAccessToken).mockResolvedValue('test-token')
    vi.mocked(ghlPut).mockResolvedValue({} as never)
    // A healthy Trigger.dev — a null handle means the enqueue was dropped and
    // must not produce a stamp.
    vi.mocked(enqueueGhlStageMove).mockResolvedValue({ id: 'run_1' } as never)
    vi.mocked(checkEligibility).mockResolvedValue({
      eligible: true, sessionsAttended: 2, sessionsTotal: 2, ceCredits: 1,
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    certChain = makeChain({
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      single: vi.fn().mockResolvedValue({ data: mockNewCert, error: null }),
    })
    regChain = makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockReg }) })

    mockFromImpl = (t) => {
      // resolveEmbedContext — the embed session's location resolves to the org.
      if (t === 'ghl_location_links') {
        return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: { org_id: ORG_ID } }) })
      }
      // assertEventOwnership — the event belongs to that org.
      if (t === 'events') {
        return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: EVENT_ID, org_id: ORG_ID } }) })
      }
      // Serves BOTH the door's FK guard and the core's own select.
      if (t === 'registrations') return regChain
      if (t === 'issued_certificates') return certChain
      if (t === 'certificate_templates') {
        return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: TEMPLATE_ID } }) })
      }
      if (t === 'ghl_sync_state') {
        return makeChain({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: SYNC_STATE_ID, ghl_contact_id: CONTACT_ID } }),
        })
      }
      return makeChain()
    }
  })

  // THE regression that motivated R61.
  it('writes the certificate merge fields to the attendee contact', async () => {
    const result = await embedIssueOrGetCertificate(EVENT_ID, REG_ID)

    expect(result.data).toMatchObject(mockNewCert)
    expect(ghlPut).toHaveBeenCalledTimes(1)
    expect(ghlPut).toHaveBeenCalledWith('test-token', `/contacts/${CONTACT_ID}`, {
      customFields: [
        { id: CERT_FIELD_IDS.prezvaEventName, value: 'Test Event' },
        { id: CERT_FIELD_IDS.prezvaCompletionDate, value: EXPECTED_COMPLETION_DATE },
      ],
    })
  })

  // The core's registration select carries end_at and timezone; the embed's own
  // select never did. A non-null completion date is the proof.
  it('passes a non-null completion date, formatted in the event timezone', async () => {
    await embedIssueOrGetCertificate(EVENT_ID, REG_ID)

    const [, , body] = vi.mocked(ghlPut).mock.calls[0]
    const dateField = (body as { customFields: Array<{ id: string; value: string }> })
      .customFields.find((f) => f.id === CERT_FIELD_IDS.prezvaCompletionDate)

    expect(dateField).toBeDefined()
    expect(dateField?.value).toBe(EXPECTED_COMPLETION_DATE)
    // Never blank, and never the UTC day.
    expect(dateField?.value).not.toBe('')
    expect(dateField?.value).not.toBe('March 15, 2026')
  })

  // INV-6 GUARD. The two assertions above read a mocked row, and the mock hands
  // back mockReg no matter what column list it is asked for — so reverting the
  // core's select to the embed's old one (which carried neither end_at nor
  // timezone) would leave both of them green while the completion date went
  // blank in production. This test reads the actual select string instead, so
  // the column list itself is what is pinned.
  it("asks for end_at and timezone — the columns the embed's own select omitted", async () => {
    await embedIssueOrGetCertificate(EVENT_ID, REG_ID)

    const calls = vi.mocked(regChain.select).mock.calls as unknown[][]
    const selects: string[] = calls.map((c) => String(c[0]))
    expect(selects.some((sel: string) => sel.includes('end_at') && sel.includes('timezone'))).toBe(true)
  })

  it('moves the opportunity to the certificateIssued stage', async () => {
    await embedIssueOrGetCertificate(EVENT_ID, REG_ID)

    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
    expect(enqueueGhlStageMove).toHaveBeenCalledWith({
      registrationId: REG_ID,
      stageId: GHL_STAGE_IDS.certificateIssued,
    })
  })

  // The second family the embed door was missing: the attendee never got mail.
  it('enqueues the certificate delivery email', async () => {
    await embedIssueOrGetCertificate(EVENT_ID, REG_ID)

    expect(enqueueCertificateEmail).toHaveBeenCalledTimes(1)
    expect(enqueueCertificateEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId: REG_ID,
        attendeeEmail: 'alice@test.com',
        attendeeName: 'Alice',
        eventTitle: 'Test Event',
      }),
    )
  })

  it('stamps ghl_synced_at on a genuine success', async () => {
    await embedIssueOrGetCertificate(EVENT_ID, REG_ID)

    expect(certChain.update).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(certChain.update).mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(payload)).toEqual(['ghl_synced_at'])
    expect(Number.isNaN(Date.parse(payload.ghl_synced_at as string))).toBe(false)
  })

  // The embed door's one legitimate difference from the dashboard survives the
  // move into the shared core.
  it("still records the audit row with via: 'embed'", async () => {
    await embedIssueOrGetCertificate(EVENT_ID, REG_ID)

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      ORG_ID,
      null,
      'certificate.issue',
      'issued_certificates',
      mockNewCert.id,
      expect.objectContaining({ registrationId: REG_ID, via: 'embed' }),
    )
  })

  it('still refuses a registration that belongs to another event', async () => {
    mockFromImpl = ((prev) => (t: string) => {
      if (t === 'registrations') {
        return makeChain({
          maybeSingle: vi.fn().mockResolvedValue({ data: { ...mockReg, event_id: 'some-other-event' } }),
        })
      }
      return prev(t)
    })(mockFromImpl)

    const result = await embedIssueOrGetCertificate(EVENT_ID, REG_ID)

    expect(result.error).toBe('Registration not found')
    expect(ghlPut).not.toHaveBeenCalled()
    expect(enqueueCertificateEmail).not.toHaveBeenCalled()
  })
})

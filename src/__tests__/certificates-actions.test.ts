import { describe, it, expect, vi, beforeEach } from 'vitest'

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
// Partial mock, deliberately. A bare factory here would leave any client export
// actions.ts imports but this file forgot to list as undefined, and the GHL
// block's catch would swallow the resulting TypeError — green test, dead write
// in production. Keeping the real module means only ghlPut is substituted.
vi.mock('@/lib/integrations/ghl/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/ghl/client')>()
  return { ...actual, ghlPut: vi.fn() }
})

let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

import { issueOrGetCertificate } from '@/lib/certificates/actions'
import { checkEligibility } from '@/lib/certificates/eligibility'
import { enqueueGhlStageMove } from '@/lib/trigger'
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

// Built from the legacy constants so this fixture can't drift from production values.
// Cast: GHL_FIELD_KEYS is SAUP's real 9-key field map — it's missing prezvaEventDate
// (10th field, GE-8) because SAUP hasn't been re-provisioned yet. Not a type escape hatch.
const SAUP_CONFIG: GhlOrgConfig = {
  pipelineId: GHL_EVENTS_PIPELINE_ID,
  stageIds: GHL_STAGE_IDS,
  fieldIds: GHL_FIELD_KEYS as GhlOrgConfig['fieldIds'],
  stageTags: GHL_STAGE_TAGS,
  stageSupersedesTags: GHL_STAGE_SUPERSEDES_TAGS,
  calendarId: null,
}

// SAUP_CONFIG models an org provisioned BEFORE this batch: field_ids carries no
// prezvaEventName / prezvaCompletionDate. CONFIG_WITH_CERT_FIELDS models one
// re-provisioned after it.
const CERT_FIELD_IDS = {
  prezvaEventName: 'field-event-name',
  prezvaCompletionDate: 'field-completion-date',
}

const CONFIG_WITH_CERT_FIELDS: GhlOrgConfig = {
  ...SAUP_CONFIG,
  fieldIds: { ...SAUP_CONFIG.fieldIds, ...CERT_FIELD_IDS } as GhlOrgConfig['fieldIds'],
}

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

const REG_ID = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const TEMPLATE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5f'

// end_at is 8pm March 14 in America/New_York — already March 15 in UTC. Any
// slip to UTC formatting shows up as "March 15, 2026" in the assertions below.
const mockReg = {
  event_id: 'event-1',
  user_id: null,
  attendee_name: 'Alice',
  attendee_email: 'alice@test.com',
  events: {
    org_id: 'org-1',
    title: 'Test Event',
    slug: 'test-event',
    end_at: '2026-03-15T00:00:00Z',
    timezone: 'America/New_York',
  },
}

const EXPECTED_COMPLETION_DATE = 'March 14, 2026'
const CONTACT_ID = 'ghl-contact-1'
const SYNC_STATE_ID = 'sync-state-1'

const mockNewCert = { id: 'cert-1', registration_id: REG_ID }

describe('issueOrGetCertificate — GHL stage move', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ghlLocationIdForOrg).mockResolvedValue(LOCATION_ID)
    vi.mocked(getGhlOrgConfig).mockResolvedValue(SAUP_CONFIG)
  })

  it('fires enqueueGhlStageMove exactly once with the certificateIssued stage on new issuance', async () => {
    vi.mocked(checkEligibility).mockResolvedValue({
      eligible: true, sessionsAttended: 2, sessionsTotal: 2, ceCredits: 1,
    })

    mockFromImpl = (t) => {
      if (t === 'issued_certificates') {
        return makeChain({
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          single: vi.fn().mockResolvedValue({ data: mockNewCert, error: null }),
        })
      }
      if (t === 'certificate_templates') {
        return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: TEMPLATE_ID } }) })
      }
      if (t === 'registrations') {
        return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockReg }) })
      }
      return makeChain()
    }

    const result = await issueOrGetCertificate(REG_ID)

    expect(result.data).toEqual(mockNewCert)
    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
    expect(enqueueGhlStageMove).toHaveBeenCalledWith({
      registrationId: REG_ID,
      stageId: GHL_STAGE_IDS.certificateIssued,
    })
  })

  // R61: this is the "existing cert + already stamped -> ZERO GHL calls" case.
  // The fixture now carries ghl_synced_at, which is what the test's name always
  // meant. Without it the certificate is an UNSTAMPED one at a GHL-linked org,
  // which the repair path is supposed to pick up — so the old fixture would
  // have asserted the absence of exactly the behaviour R61 adds.
  it('does not fire enqueueGhlStageMove when a certificate already exists and is stamped', async () => {
    const existingCert = {
      id: 'cert-existing',
      registration_id: REG_ID,
      ghl_synced_at: '2026-08-25T12:00:00.000Z',
    }
    mockFromImpl = (t) => {
      if (t === 'issued_certificates') {
        return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: existingCert }) })
      }
      return makeChain()
    }

    const result = await issueOrGetCertificate(REG_ID)

    expect(result.data).toEqual(existingCert)
    expect(checkEligibility).not.toHaveBeenCalled()
    // ZERO GHL calls — not merely no stage move. A stamped certificate must not
    // even look up whether its org is linked; this is the hot download path.
    expect(ghlLocationIdForOrg).not.toHaveBeenCalled()
    expect(getGhlOrgConfig).not.toHaveBeenCalled()
    expect(ghlPut).not.toHaveBeenCalled()
    expect(enqueueGhlStageMove).not.toHaveBeenCalled()
  })
})

// R57: the two certificate merge fields (event name + completion date) written
// to the GHL contact at issue time so the certificate template renders per-event
// instead of the hardcoded "SAUP Annual CE Conference 2026" / "June 1, 2026".
describe('issueOrGetCertificate — certificate merge fields', () => {
  // Records the real call order across two different mocked modules. The
  // ordering assertion is the point of this batch: the prezva-cert-issued tag
  // applied by the stage move is what triggers the GHL workflow that renders
  // the certificate, so a write that lands after the enqueue renders blanks.
  let callOrder: string[]

  function setupIssuance(opts: { syncState?: { id: string; ghl_contact_id: string | null } | null } = {}) {
    const syncState = opts.syncState === undefined
      ? { id: SYNC_STATE_ID, ghl_contact_id: CONTACT_ID }
      : opts.syncState
    const syncStateChain = makeChain({
      maybeSingle: vi.fn().mockResolvedValue({ data: syncState }),
    })

    mockFromImpl = (t) => {
      if (t === 'issued_certificates') {
        return makeChain({
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          single: vi.fn().mockResolvedValue({ data: mockNewCert, error: null }),
        })
      }
      if (t === 'certificate_templates') {
        return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: TEMPLATE_ID } }) })
      }
      if (t === 'registrations') {
        return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockReg }) })
      }
      if (t === 'ghl_sync_state') return syncStateChain
      return makeChain()
    }
    return syncStateChain
  }

  beforeEach(() => {
    vi.clearAllMocks()
    callOrder = []
    vi.mocked(ghlLocationIdForOrg).mockResolvedValue(LOCATION_ID)
    vi.mocked(getGhlOrgConfig).mockResolvedValue(CONFIG_WITH_CERT_FIELDS)
    vi.mocked(checkEligibility).mockResolvedValue({
      eligible: true, sessionsAttended: 2, sessionsTotal: 2, ceCredits: 1,
    })
    vi.mocked(ghlAdapter.getAccessToken).mockResolvedValue('test-token')
    vi.mocked(ghlPut).mockImplementation(async () => { callOrder.push('ghlPut'); return {} as never })
    vi.mocked(enqueueGhlStageMove).mockImplementation(async () => { callOrder.push('enqueue'); return null as never })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('writes both merge fields to the attendee contact', async () => {
    setupIssuance()

    await issueOrGetCertificate(REG_ID)

    expect(ghlPut).toHaveBeenCalledTimes(1)
    expect(ghlPut).toHaveBeenCalledWith('test-token', `/contacts/${CONTACT_ID}`, {
      customFields: [
        { id: CERT_FIELD_IDS.prezvaEventName, value: 'Test Event' },
        { id: CERT_FIELD_IDS.prezvaCompletionDate, value: EXPECTED_COMPLETION_DATE },
      ],
    })
  })

  it('formats the completion date in the event timezone, not UTC', async () => {
    setupIssuance()

    await issueOrGetCertificate(REG_ID)

    // end_at 2026-03-15T00:00:00Z is 8pm March 14 in America/New_York. UTC
    // formatting would put "March 15, 2026" on a CE certificate.
    const [, , body] = vi.mocked(ghlPut).mock.calls[0]
    const dateField = (body as { customFields: Array<{ id: string; value: string }> })
      .customFields.find((f) => f.id === CERT_FIELD_IDS.prezvaCompletionDate)
    expect(dateField?.value).toBe('March 14, 2026')
    expect(dateField?.value).not.toBe('March 15, 2026')
  })

  it('writes the fields BEFORE enqueueing the stage move', async () => {
    setupIssuance()

    await issueOrGetCertificate(REG_ID)

    expect(callOrder).toEqual(['ghlPut', 'enqueue'])
  })

  it('omits the completion date when the event has no timezone, and still writes the name', async () => {
    mockFromImpl = () => makeChain()
    const noTz = { ...mockReg, events: { ...mockReg.events, timezone: null } }
    const syncStateChain = makeChain({
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: SYNC_STATE_ID, ghl_contact_id: CONTACT_ID } }),
    })
    mockFromImpl = (t) => {
      if (t === 'issued_certificates') {
        return makeChain({
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          single: vi.fn().mockResolvedValue({ data: mockNewCert, error: null }),
        })
      }
      if (t === 'certificate_templates') {
        return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: TEMPLATE_ID } }) })
      }
      if (t === 'registrations') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: noTz }) })
      if (t === 'ghl_sync_state') return syncStateChain
      return makeChain()
    }

    await issueOrGetCertificate(REG_ID)

    // A null completion date omits the field — it is never written blank.
    expect(ghlPut).toHaveBeenCalledWith('test-token', `/contacts/${CONTACT_ID}`, {
      customFields: [{ id: CERT_FIELD_IDS.prezvaEventName, value: 'Test Event' }],
    })
    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
  })

  it('degrades silently for an org provisioned before this batch — no write, no throw, stage move unaffected', async () => {
    // SAUP_CONFIG's field_ids carries neither new key.
    vi.mocked(getGhlOrgConfig).mockResolvedValue(SAUP_CONFIG)
    setupIssuance()

    const result = await issueOrGetCertificate(REG_ID)

    expect(result.data).toEqual(mockNewCert)
    expect(ghlPut).not.toHaveBeenCalled()
    // Guards run before any I/O, so the sync-state row is never even read.
    expect(mockFrom).not.toHaveBeenCalledWith('ghl_sync_state')
    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
  })

  it('skips the write when the registration has no GHL contact', async () => {
    setupIssuance({ syncState: null })

    await issueOrGetCertificate(REG_ID)

    expect(ghlPut).not.toHaveBeenCalled()
    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
  })

  it('records the failure on the sync ledger and still enqueues the stage move', async () => {
    const syncStateChain = setupIssuance()
    vi.mocked(ghlPut).mockImplementation(async () => {
      callOrder.push('ghlPut')
      throw new Error('GHL 500')
    })

    const result = await issueOrGetCertificate(REG_ID)

    // Certificate issuance itself is unaffected — the GHL leg is non-fatal.
    expect(result.data).toEqual(mockNewCert)
    expect(syncStateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ last_error: expect.stringContaining('cert_fields_write_failed') }),
    )
    expect(syncStateChain.eq).toHaveBeenCalledWith('id', SYNC_STATE_ID)
    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
  })

  it('still enqueues the stage move when the ledger write itself throws', async () => {
    // The enqueue sits outside the write's try/catch precisely for this case.
    setupIssuance()
    vi.mocked(ghlAdapter.getAccessToken).mockResolvedValue(null)
    mockFromImpl = (t) => {
      if (t === 'issued_certificates') {
        return makeChain({
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          single: vi.fn().mockResolvedValue({ data: mockNewCert, error: null }),
        })
      }
      if (t === 'certificate_templates') {
        return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: TEMPLATE_ID } }) })
      }
      if (t === 'registrations') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockReg }) })
      if (t === 'ghl_sync_state') {
        return makeChain({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: SYNC_STATE_ID, ghl_contact_id: CONTACT_ID } }),
          update: vi.fn(() => { throw new Error('ledger unavailable') }),
        })
      }
      return makeChain()
    }

    const result = await issueOrGetCertificate(REG_ID)

    expect(result.data).toEqual(mockNewCert)
    expect(ghlPut).not.toHaveBeenCalled()
    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
  })
})
// R61: the repair path. Certificates issued through the embed door never ran
// the GHL half at all, and a dashboard certificate whose merge write failed is
// in the same state. ghl_synced_at NULL is the marker for both, and finding it
// on an existing certificate re-runs the GHL half exactly once.
//
// The stamp assertions below read the ACTUAL update payload rather than just
// asserting that update() was called. These tests mock Supabase, so a payload
// written to the wrong column — or a stamp written on a failure — would sail
// past a bare "was it called" assertion while hiding the certificate from
// repair permanently in production.
describe('issueOrGetCertificate — GHL repair path', () => {
  const EXISTING_UNSTAMPED = {
    id: 'cert-existing',
    registration_id: REG_ID,
    ghl_synced_at: null,
  }

  // Returns the issued_certificates chain so the stamp can be asserted on it.
  // Each table gets ONE cached chain, so the existing-cert read and the stamp
  // update land on the same object — and so the ghl_sync_state ledger update
  // stays on a DIFFERENT object and can never be mistaken for the stamp.
  function setupRepair(opts: { syncState?: { id: string; ghl_contact_id: string | null } | null } = {}) {
    const syncState = opts.syncState === undefined
      ? { id: SYNC_STATE_ID, ghl_contact_id: CONTACT_ID }
      : opts.syncState

    const certChain = makeChain({
      maybeSingle: vi.fn().mockResolvedValue({ data: EXISTING_UNSTAMPED }),
    })
    const syncStateChain = makeChain({
      maybeSingle: vi.fn().mockResolvedValue({ data: syncState }),
    })
    const regChain = makeChain({
      maybeSingle: vi.fn().mockResolvedValue({ data: mockReg }),
    })

    mockFromImpl = (t) => {
      if (t === 'issued_certificates') return certChain
      if (t === 'registrations') return regChain
      if (t === 'ghl_sync_state') return syncStateChain
      return makeChain()
    }
    return { certChain, syncStateChain }
  }

  function stampPayloadOf(certChain: Record<string, any>) {
    expect(certChain.update).toHaveBeenCalledTimes(1)
    return vi.mocked(certChain.update).mock.calls[0][0] as Record<string, unknown>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ghlLocationIdForOrg).mockResolvedValue(LOCATION_ID)
    vi.mocked(getGhlOrgConfig).mockResolvedValue(CONFIG_WITH_CERT_FIELDS)
    vi.mocked(ghlAdapter.getAccessToken).mockResolvedValue('test-token')
    vi.mocked(ghlPut).mockResolvedValue({} as never)
    // A HEALTHY Trigger.dev: enqueueGhlStageMove resolves to a real handle.
    // The module factory's default is null, which is what a dropped enqueue
    // looks like — and null must never produce a stamp. See the last test here.
    vi.mocked(enqueueGhlStageMove).mockResolvedValue({ id: 'run_1' } as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('runs the GHL half and writes the stamp for an unstamped certificate at a linked org', async () => {
    const { certChain } = setupRepair()

    const result = await issueOrGetCertificate(REG_ID)

    // The same certificate is returned — repair is not re-issuance — but with
    // the stamp it just earned, so a caller reading ghl_synced_at off the
    // result cannot see the pre-repair NULL and repair it a second time.
    expect(result.data).toMatchObject({
      id: EXISTING_UNSTAMPED.id,
      registration_id: REG_ID,
    })
    expect(typeof result.data.ghl_synced_at).toBe('string')
    // Repair must NOT re-run eligibility: the certificate was already earned.
    expect(checkEligibility).not.toHaveBeenCalled()

    expect(ghlPut).toHaveBeenCalledTimes(1)
    expect(ghlPut).toHaveBeenCalledWith('test-token', `/contacts/${CONTACT_ID}`, {
      customFields: [
        { id: CERT_FIELD_IDS.prezvaEventName, value: 'Test Event' },
        { id: CERT_FIELD_IDS.prezvaCompletionDate, value: EXPECTED_COMPLETION_DATE },
      ],
    })
    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
    expect(enqueueGhlStageMove).toHaveBeenCalledWith({
      registrationId: REG_ID,
      stageId: GHL_STAGE_IDS.certificateIssued,
    })

    // Payload, not just the call: exactly one column, and a real timestamp.
    const payload = stampPayloadOf(certChain)
    expect(Object.keys(payload)).toEqual(['ghl_synced_at'])
    expect(typeof payload.ghl_synced_at).toBe('string')
    expect(Number.isNaN(Date.parse(payload.ghl_synced_at as string))).toBe(false)
    expect(certChain.eq).toHaveBeenCalledWith('id', EXISTING_UNSTAMPED.id)
  })

  it('makes no GHL calls and writes no stamp for an unstamped certificate at a standalone org', async () => {
    vi.mocked(ghlLocationIdForOrg).mockResolvedValue(null)
    const { certChain } = setupRepair()

    const result = await issueOrGetCertificate(REG_ID)

    expect(result.data).toEqual(EXISTING_UNSTAMPED)
    // A standalone org has nothing to sync. It must not attempt repair work on
    // every call, and it must never be stamped — there is nothing to stamp for.
    expect(getGhlOrgConfig).not.toHaveBeenCalled()
    expect(ghlPut).not.toHaveBeenCalled()
    expect(enqueueGhlStageMove).not.toHaveBeenCalled()
    expect(certChain.update).not.toHaveBeenCalled()
  })

  it('writes NO stamp when the merge write fails, leaving the certificate repairable', async () => {
    const { certChain, syncStateChain } = setupRepair()
    vi.mocked(ghlPut).mockRejectedValue(new Error('GHL 500'))

    const result = await issueOrGetCertificate(REG_ID)

    expect(result.data).toEqual(EXISTING_UNSTAMPED)
    // The stage move still fires — stranding the attendee is worse.
    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
    // The ledger records the failure...
    expect(syncStateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ last_error: expect.stringContaining('cert_fields_write_failed') }),
    )
    // ...and the certificate is NOT stamped. A stamp here would hide this
    // certificate from every future repair pass, permanently.
    expect(certChain.update).not.toHaveBeenCalled()
  })

  it('writes NO stamp when the org is linked but has no ghl_org_config row', async () => {
    vi.mocked(getGhlOrgConfig).mockResolvedValue(null)
    const { certChain } = setupRepair()

    await issueOrGetCertificate(REG_ID)

    expect(ghlPut).not.toHaveBeenCalled()
    expect(enqueueGhlStageMove).not.toHaveBeenCalled()
    expect(certChain.update).not.toHaveBeenCalled()
  })

  // Both tests below run with a HEALTHY enqueue and a successful-looking GHL
  // leg, which is exactly the shape under which an earlier cut of this batch
  // DID stamp. Neither outcome wrote anything to the contact, and both are
  // conditions that flip on their own later — so stamping would strand the
  // certificate with its merge fields permanently unwritten.

  it("writes NO stamp when the org has no certificate field ids to write", async () => {
    // SAUP_CONFIG models an org provisioned before the cert fields existed.
    // Re-provisioning it later must still be able to fill these fields in.
    vi.mocked(getGhlOrgConfig).mockResolvedValue(SAUP_CONFIG)
    const { certChain } = setupRepair()

    const result = await issueOrGetCertificate(REG_ID)

    expect(ghlPut).not.toHaveBeenCalled()
    // The guards return before any I/O, so the ledger is never even read.
    expect(mockFrom).not.toHaveBeenCalledWith('ghl_sync_state')
    expect(certChain.update).not.toHaveBeenCalled()
    expect(result.data.ghl_synced_at).toBeNull()
  })

  it("writes NO stamp when the registration has no GHL contact yet", async () => {
    // internal_registration_id and ghl_contact_id are bound together by one
    // UPDATE in the app webhook. A certificate issued before that lands has no
    // contact to merge into YET — stamping here would mean the merge fields are
    // never written once the webhook finally binds it. Costs a few reads and no
    // PUT per call, and self-terminates the moment the contact exists.
    const { certChain } = setupRepair({ syncState: null })

    const result = await issueOrGetCertificate(REG_ID)

    expect(ghlPut).not.toHaveBeenCalled()
    expect(certChain.update).not.toHaveBeenCalled()
    expect(result.data.ghl_synced_at).toBeNull()
  })

  // enqueueGhlStageMove never throws — it returns null when TRIGGER_SECRET_KEY
  // is unset and on a Trigger.dev outage. A stamp keyed on "did not throw"
  // would mark this certificate synced while the stage move was silently
  // dropped, hiding it from repair forever with the GHL half half-done.
  it('writes NO stamp when the merge write succeeds but the stage-move enqueue is silently dropped', async () => {
    const { certChain } = setupRepair()
    vi.mocked(enqueueGhlStageMove).mockResolvedValue(null as never)

    const result = await issueOrGetCertificate(REG_ID)

    // The merge write itself did land...
    expect(ghlPut).toHaveBeenCalledTimes(1)
    // ...but the certificate stays unstamped, and therefore repairable.
    expect(certChain.update).not.toHaveBeenCalled()
    expect(result.data.ghl_synced_at).toBeNull()
  })

  it('stamps a genuine success on FIRST issuance, not only on repair', async () => {
    vi.mocked(checkEligibility).mockResolvedValue({
      eligible: true, sessionsAttended: 2, sessionsTotal: 2, ceCredits: 1,
    })
    const certChain = makeChain({
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      single: vi.fn().mockResolvedValue({ data: mockNewCert, error: null }),
    })
    mockFromImpl = (t) => {
      if (t === 'issued_certificates') return certChain
      if (t === 'certificate_templates') {
        return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: TEMPLATE_ID } }) })
      }
      if (t === 'registrations') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockReg }) })
      if (t === 'ghl_sync_state') {
        return makeChain({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: SYNC_STATE_ID, ghl_contact_id: CONTACT_ID } }),
        })
      }
      return makeChain()
    }

    await issueOrGetCertificate(REG_ID)

    const payload = stampPayloadOf(certChain)
    expect(Object.keys(payload)).toEqual(['ghl_synced_at'])
    expect(Number.isNaN(Date.parse(payload.ghl_synced_at as string))).toBe(false)
    expect(certChain.eq).toHaveBeenCalledWith('id', mockNewCert.id)
  })
})

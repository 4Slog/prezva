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
import {
  GHL_STAGE_IDS,
  GHL_EVENTS_PIPELINE_ID,
  GHL_FIELD_KEYS,
  GHL_STAGE_TAGS,
  GHL_STAGE_SUPERSEDES_TAGS,
} from '@/lib/integrations/ghl/config'

const LOCATION_ID = '4KrDX2FYA2XZ68q88rFS'

// Built from the legacy constants so this fixture can't drift from production values.
const SAUP_CONFIG: GhlOrgConfig = {
  pipelineId: GHL_EVENTS_PIPELINE_ID,
  stageIds: GHL_STAGE_IDS,
  fieldIds: GHL_FIELD_KEYS,
  stageTags: GHL_STAGE_TAGS,
  stageSupersedesTags: GHL_STAGE_SUPERSEDES_TAGS,
}

function makeChain(override: Record<string, any> = {}) {
  const base: Record<string, any> = {}
  for (const k of ['select', 'insert', 'eq']) {
    base[k] = vi.fn().mockReturnThis()
  }
  base.single = vi.fn()
  base.maybeSingle = vi.fn()
  for (const k of Object.keys(override)) base[k] = override[k]
  return base
}

const REG_ID = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const TEMPLATE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5f'

const mockReg = {
  event_id: 'event-1',
  user_id: null,
  attendee_name: 'Alice',
  attendee_email: 'alice@test.com',
  events: { org_id: 'org-1', title: 'Test Event', slug: 'test-event' },
}

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

  it('does not fire enqueueGhlStageMove when a certificate already exists', async () => {
    const existingCert = { id: 'cert-existing', registration_id: REG_ID }
    mockFromImpl = (t) => {
      if (t === 'issued_certificates') {
        return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: existingCert }) })
      }
      return makeChain()
    }

    const result = await issueOrGetCertificate(REG_ID)

    expect(result.data).toEqual(existingCert)
    expect(checkEligibility).not.toHaveBeenCalled()
    expect(enqueueGhlStageMove).not.toHaveBeenCalled()
  })
})

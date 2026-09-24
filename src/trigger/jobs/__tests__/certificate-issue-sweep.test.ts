import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeFakeAdmin, type Recorded } from './fake-supabase'

vi.mock('@trigger.dev/sdk', () => ({
  schemaTask: (opts: any) => opts,
}))

vi.mock('../../lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/certificates/issue-core', () => ({
  issueCertificateCore: vi.fn(),
}))

vi.mock('@/lib/audit/log', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}))

import {
  findCertificateIssueCandidates,
  processCertificateIssueCandidate,
  certificateIssueSweepTask,
} from '../certificate-issue-sweep'
import { issueCertificateCore } from '@/lib/certificates/issue-core'
import { logAudit } from '@/lib/audit/log'
import { createAdminClient } from '../../lib/supabase-admin'

const EVENT_ID = 'event-1'
const ORG_ID = 'org-1'

beforeEach(() => {
  vi.mocked(issueCertificateCore).mockReset()
  vi.mocked(logAudit).mockReset().mockResolvedValue(undefined)
  vi.mocked(createAdminClient).mockReset()
})

describe('findCertificateIssueCandidates', () => {
  it('selects only confirmed registrations for the event', async () => {
    const { admin, calls } = makeFakeAdmin((call: Recorded) => {
      expect(call.table).toBe('registrations')
      return { data: [{ id: 'reg-1' }, { id: 'reg-2' }], error: null }
    })

    const ids = await findCertificateIssueCandidates(admin as any, EVENT_ID)

    expect(ids).toEqual(['reg-1', 'reg-2'])
    // The WHERE itself is the assertion — a sweep that queued cancelled or
    // waitlisted registrations would issue certificates to people who did not
    // attend, and the count the organizer was shown would be wrong too.
    expect(calls[0].filters).toEqual({
      event_id: { eq: EVENT_ID },
      status: { eq: 'confirmed' },
    })
  })

  it('returns [] when the event has no confirmed registrations', async () => {
    const { admin } = makeFakeAdmin(() => ({ data: [], error: null }))
    expect(await findCertificateIssueCandidates(admin as any, EVENT_ID)).toEqual([])
  })

  it('THROWS on a read error rather than reporting an empty event', async () => {
    // Falling through to [] here would let the task write a clean
    // { issued: 0, skipped: 0, failed: 0 } audit row and return success, so
    // Trigger.dev would never retry — and the organizer, already told their
    // attendees were queued, would get nothing plus an audit trail asserting
    // there was nothing to do.
    const { admin } = makeFakeAdmin(() => ({ data: null, error: { message: 'boom' } }))
    await expect(findCertificateIssueCandidates(admin as any, EVENT_ID)).rejects.toThrow('boom')
  })

  it('returns [] for a genuinely empty result with no error', async () => {
    const { admin } = makeFakeAdmin(() => ({ data: null, error: null }))
    expect(await findCertificateIssueCandidates(admin as any, EVENT_ID)).toEqual([])
  })
})

describe('processCertificateIssueCandidate', () => {
  it('classifies a fresh certificate as issued', async () => {
    vi.mocked(issueCertificateCore).mockResolvedValue({ data: { id: 'cert-1' } })
    const { admin } = makeFakeAdmin(() => ({ data: null, error: null }))

    const result = await processCertificateIssueCandidate(admin as any, 'reg-1', 'dashboard')

    expect(result).toEqual({ issued: true, certificateId: 'cert-1' })
    expect(issueCertificateCore).toHaveBeenCalledWith(admin, 'reg-1', 'dashboard')
  })

  it('classifies an ineligible registration as skipped, NOT failed', async () => {
    // The core returns skipped AND error together for an ineligible
    // registration. Checking error first would report every ineligible
    // attendee as a failure — that is the bug this case pins.
    vi.mocked(issueCertificateCore).mockResolvedValue({
      skipped: true,
      error: 'Attended 1 of 5 sessions',
    })
    const { admin } = makeFakeAdmin(() => ({ data: null, error: null }))

    const result = await processCertificateIssueCandidate(admin as any, 'reg-1', 'embed')

    expect(result).toEqual({ skipped: true, reason: 'Attended 1 of 5 sessions' })
  })

  it('classifies a core error as failed', async () => {
    vi.mocked(issueCertificateCore).mockResolvedValue({ error: 'No certificate template configured' })
    const { admin } = makeFakeAdmin(() => ({ data: null, error: null }))

    const result = await processCertificateIssueCandidate(admin as any, 'reg-1', 'dashboard')

    expect(result).toEqual({ failed: true, error: 'No certificate template configured' })
  })

  it('is total: a throw out of the core comes back as failed, not as a rejection', async () => {
    // The task loop has no try/catch and must not need one. If this runner can
    // throw, one bad registration aborts the whole sweep and the audit row —
    // the only record of the run — never gets written.
    vi.mocked(issueCertificateCore).mockRejectedValue(new Error('connection reset'))
    const { admin } = makeFakeAdmin(() => ({ data: null, error: null }))

    const result = await processCertificateIssueCandidate(admin as any, 'reg-1', 'dashboard')

    expect(result).toEqual({ failed: true, error: 'connection reset' })
  })

  it('passes the source through to the core unchanged', async () => {
    vi.mocked(issueCertificateCore).mockResolvedValue({ data: { id: 'cert-9' } })
    const { admin } = makeFakeAdmin(() => ({ data: null, error: null }))

    await processCertificateIssueCandidate(admin as any, 'reg-9', 'embed')

    expect(issueCertificateCore).toHaveBeenCalledWith(admin, 'reg-9', 'embed')
  })
})

describe('certificateIssueSweepTask.run', () => {
  function mountAdmin(registrationIds: string[]) {
    const { admin, calls } = makeFakeAdmin((call: Recorded) => {
      if (call.table === 'events') return { data: { org_id: ORG_ID }, error: null }
      if (call.table === 'registrations') {
        return { data: registrationIds.map((id) => ({ id })), error: null }
      }
      throw new Error(`unexpected call in test: ${call.table} ${call.mode}`)
    })
    vi.mocked(createAdminClient).mockReturnValue(admin as any)
    return { admin, calls }
  }

  it('writes an audit row carrying the counts and the source', async () => {
    mountAdmin(['reg-1', 'reg-2', 'reg-3'])
    vi.mocked(issueCertificateCore)
      .mockResolvedValueOnce({ data: { id: 'cert-1' } })
      .mockResolvedValueOnce({ skipped: true, error: 'Not eligible' })
      .mockResolvedValueOnce({ error: 'template missing' })

    const result = await (certificateIssueSweepTask as any).run({ eventId: EVENT_ID, via: 'dashboard' })

    expect(result).toEqual({ issued: 1, skipped: 1, failed: 1 })
    // Once the work is async this row is the ONLY record that the run happened
    // or how it went — the caller got a queued count and was gone.
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      ORG_ID,
      null,
      'certificate.bulk_issue',
      'events',
      EVENT_ID,
      { issued: 1, skipped: 1, failed: 1, eventId: EVENT_ID, via: 'dashboard' },
      { eventId: EVENT_ID },
    )
  })

  it('carries via: embed through from the payload', async () => {
    mountAdmin(['reg-1'])
    vi.mocked(issueCertificateCore).mockResolvedValue({ data: { id: 'cert-1' } })

    await (certificateIssueSweepTask as any).run({ eventId: EVENT_ID, via: 'embed' })

    // The embed door has no Prezva user id, so `via` is the only attribution
    // the audit row will ever carry. A sweep that hardcoded 'dashboard' would
    // make every embed-triggered bulk run untraceable to its actual door.
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(), ORG_ID, null, 'certificate.bulk_issue', 'events', EVENT_ID,
      expect.objectContaining({ via: 'embed' }),
      { eventId: EVENT_ID },
    )
  })

  it('audits org-scoped with a null user_id on both doors', async () => {
    mountAdmin(['reg-1'])
    vi.mocked(issueCertificateCore).mockResolvedValue({ data: { id: 'cert-1' } })

    await (certificateIssueSweepTask as any).run({ eventId: EVENT_ID, via: 'dashboard' })

    const [, orgArg, userArg] = vi.mocked(logAudit).mock.calls[0]
    expect(orgArg).toBe(ORG_ID)
    expect(userArg).toBeNull()
  })

  it('still audits a zero-candidate run', async () => {
    mountAdmin([])

    const result = await (certificateIssueSweepTask as any).run({ eventId: EVENT_ID, via: 'dashboard' })

    expect(result).toEqual({ issued: 0, skipped: 0, failed: 0 })
    expect(issueCertificateCore).not.toHaveBeenCalled()
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(), ORG_ID, null, 'certificate.bulk_issue', 'events', EVENT_ID,
      { issued: 0, skipped: 0, failed: 0, eventId: EVENT_ID, via: 'dashboard' },
      { eventId: EVENT_ID },
    )
  })

  it('one registration throwing does not abort the rest of the sweep', async () => {
    mountAdmin(['reg-1', 'reg-2', 'reg-3'])
    vi.mocked(issueCertificateCore)
      .mockResolvedValueOnce({ data: { id: 'cert-1' } })
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce({ data: { id: 'cert-3' } })

    const result = await (certificateIssueSweepTask as any).run({ eventId: EVENT_ID, via: 'dashboard' })

    expect(result).toEqual({ issued: 2, skipped: 0, failed: 1 })
    expect(issueCertificateCore).toHaveBeenCalledTimes(3)
  })
})

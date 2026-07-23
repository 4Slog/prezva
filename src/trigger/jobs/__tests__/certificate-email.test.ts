import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { makeFakeAdmin } from './fake-supabase'

vi.mock('@trigger.dev/sdk', () => ({
  schemaTask: (opts: any) => opts,
}))

vi.mock('../../lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}))

import { sendCertificateEmail } from '../certificate-email'
import { createAdminClient } from '../../lib/supabase-admin'

type Payload = {
  registrationId: string
  attendeeEmail: string
  attendeeName: string
  eventTitle: string
  certDownloadUrl: string
  verifyUrl: string
  ceCredits?: number
  certificateId?: string
  orgEmail?: string
}
const runSendCertificateEmail = (payload: Payload) =>
  (sendCertificateEmail as unknown as { run: (p: Payload) => Promise<any> }).run(payload)

function basePayload(overrides: Partial<Payload> = {}): Payload {
  return {
    registrationId: 'reg_1',
    attendeeEmail: 'attendee@example.com',
    attendeeName: 'Jane Doe',
    eventTitle: 'Prezva Conf',
    certDownloadUrl: 'https://prezva.app/api/certificates/reg_1',
    verifyUrl: 'https://prezva.app/e/conf/certificate?id=cert_1',
    ...overrides,
  }
}

describe('sendCertificateEmail suppression gate', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-resend-key'
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ id: 'email-1' }) })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('skips the send and returns a non-throwing skip result for a suppressed address', async () => {
    const { admin } = makeFakeAdmin((call) => {
      if (call.table !== 'email_suppressions') throw new Error(`unexpected table in test: ${call.table}`)
      return { data: [{ email: 'attendee@example.com' }], error: null }
    })
    ;(createAdminClient as any).mockReturnValue(admin)

    const result = await runSendCertificateEmail(basePayload())

    expect(result).toEqual({ sent: false, reason: 'suppressed' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends normally for a non-suppressed address', async () => {
    const { admin } = makeFakeAdmin((call) => {
      if (call.table !== 'email_suppressions') throw new Error(`unexpected table in test: ${call.table}`)
      return { data: [], error: null }
    })
    ;(createAdminClient as any).mockReturnValue(admin)

    const result = await runSendCertificateEmail(basePayload())

    expect(result).toEqual({ sent: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.to).toBe('attendee@example.com')
  })
})

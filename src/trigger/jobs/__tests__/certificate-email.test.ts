import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@trigger.dev/sdk', () => ({
  schemaTask: (opts: any) => opts,
}))

vi.mock('../../lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}))

const deliverMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/email/deliver-attendee-email', () => ({
  deliverAttendeeEmail: deliverMock,
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

const FAKE_ADMIN = { marker: 'fake-admin' }

describe('sendCertificateEmail', () => {
  beforeEach(() => {
    ;(createAdminClient as any).mockReturnValue(FAKE_ADMIN)
    deliverMock.mockReset()
  })

  it('composes subject/html/text and routes them through deliverAttendeeEmail, reporting sent:true on a resend send', async () => {
    deliverMock.mockResolvedValue({ channel: 'resend' })

    const result = await runSendCertificateEmail(basePayload())

    expect(result).toEqual({ sent: true, channel: 'resend' })
    expect(deliverMock).toHaveBeenCalledTimes(1)
    const [admin, params] = deliverMock.mock.calls[0]
    expect(admin).toBe(FAKE_ADMIN)
    expect(params).toMatchObject({
      registrationId: 'reg_1',
      to: 'attendee@example.com',
      attendeeName: 'Jane Doe',
      subject: 'Prezva Conf: Your certificate is ready',
      from: 'Prezva <noreply@prezva.app>',
      replyTo: undefined,
    })
    expect(params.html).toContain('Download Certificate (PDF)')
    expect(params.text).toContain('Download Certificate (PDF)')
  })

  it('reports sent:true on a GHL send', async () => {
    deliverMock.mockResolvedValue({ channel: 'ghl' })

    const result = await runSendCertificateEmail(basePayload())

    expect(result).toEqual({ sent: true, channel: 'ghl' })
  })

  it('reports sent:false without throwing when the router skips a suppressed address', async () => {
    deliverMock.mockResolvedValue({ channel: 'resend', suppressed: true })

    const result = await runSendCertificateEmail(basePayload())

    expect(result).toEqual({ sent: false, channel: 'resend' })
  })

  it('passes orgEmail through as replyTo when present', async () => {
    deliverMock.mockResolvedValue({ channel: 'resend' })

    await runSendCertificateEmail(basePayload({ orgEmail: 'org@example.com' }))

    const [, params] = deliverMock.mock.calls[0]
    expect(params.replyTo).toBe('org@example.com')
  })
})

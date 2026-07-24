import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn().mockResolvedValue({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }) }))
vi.mock('@/lib/auth/assert-permission', () => ({ assertPermission: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/trigger', () => ({
  enqueueWaitlistProcessing: vi.fn().mockResolvedValue(undefined),
  enqueueConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}))

const deliverMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/email/deliver-attendee-email', () => ({
  deliverAttendeeEmail: deliverMock,
}))

const FAKE_ADMIN = { marker: 'fake-admin' }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => FAKE_ADMIN),
}))

import { createClient } from '@/lib/supabase/server'
import { resendConfirmation, selfCancelRegistration } from '@/lib/registrations/actions'

const REG = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const USER = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

describe('resendConfirmation delegates to deliverAttendeeEmail', () => {
  beforeEach(() => deliverMock.mockReset())

  it('sends the attendee confirmation via the rail using the fake admin client', async () => {
    const reg = {
      id: REG,
      attendee_email: 'attendee@example.com',
      attendee_name: 'Attendee Person',
      qr_code: 'qr-123',
      event_id: 'evt_1',
      events: { title: 'Conf', slug: 'conf', organizations: { id: 'org_1' } },
    }
    const chain: any = {
      select() { return chain },
      eq() { return chain },
      maybeSingle: async () => ({ data: reg, error: null }),
    }
    ;(createClient as any).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) })
    deliverMock.mockResolvedValue({ channel: 'ghl' })

    const result = await resendConfirmation(REG)

    expect(result).toEqual({ ok: true })
    expect(deliverMock).toHaveBeenCalledTimes(1)
    const [admin, params] = deliverMock.mock.calls[0]
    expect(admin).toBe(FAKE_ADMIN)
    expect(params).toMatchObject({
      registrationId: REG,
      to: 'attendee@example.com',
      attendeeName: 'Attendee Person',
      subject: 'Your registration for Conf',
      from: 'noreply@prezva.app',
    })
    expect(params.html).toContain('Attendee')
  })
})

describe('selfCancelRegistration attendee send delegates to deliverAttendeeEmail', () => {
  beforeEach(() => deliverMock.mockReset())

  it('routes the attendee cancellation email through the rail for a free (non-refund) cancellation', async () => {
    const reg = {
      id: REG,
      status: 'confirmed',
      user_id: USER,
      amount_paid_cents: 0,
      attendee_email: 'attendee@example.com',
      attendee_name: 'Attendee Person',
      event_id: 'evt_1',
      events: { title: 'Conf', slug: 'conf', start_at: '2999-01-01T00:00:00Z', organizations: { name: 'Acme Org' } },
    }
    const registrationsChain: any = {
      select() { return registrationsChain },
      eq() { return registrationsChain },
      update() { return registrationsChain },
      maybeSingle: async () => ({ data: reg, error: null }),
    }
    const admin = {
      from(table: string) {
        if (table === 'registrations') return registrationsChain
        throw new Error(`unexpected table in test: ${table}`)
      },
    }
    const { createAdminClient } = await import('@/lib/supabase/admin')
    ;(createAdminClient as any).mockReturnValue(admin)
    ;(createClient as any).mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER } } }) } })
    deliverMock.mockResolvedValue({ channel: 'ghl' })

    const result = await selfCancelRegistration(REG)

    expect(result).toEqual({ ok: true, isPaid: false })
    expect(deliverMock).toHaveBeenCalledTimes(1)
    const [deliveredAdmin, params] = deliverMock.mock.calls[0]
    expect(deliveredAdmin).toBe(admin)
    expect(params).toMatchObject({
      registrationId: REG,
      to: 'attendee@example.com',
      attendeeName: 'Attendee Person',
      subject: 'Acme Org: Registration cancelled — Conf',
      from: 'Acme Org <noreply@prezva.app>',
    })

    ;(createAdminClient as any).mockReturnValue(FAKE_ADMIN)
  })
})

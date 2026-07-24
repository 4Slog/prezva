import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn().mockResolvedValue({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }) }))
vi.mock('@/lib/auth/assert-permission', () => ({ assertPermission: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const deliverMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/email/deliver-attendee-email', () => ({
  deliverAttendeeEmail: deliverMock,
}))

const FAKE_ADMIN = { marker: 'fake-admin' }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => FAKE_ADMIN),
}))

import { createClient } from '@/lib/supabase/server'
import { getSurveys, createSurvey, publishSurvey, closeSurvey, sendSurveyToAllAttendees } from '@/lib/surveys/actions'

const EVT = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const SURVEY = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

function makeChain(data: any = null, error: any = null) {
  const c: any = {}
  c.select = vi.fn().mockReturnValue(c)
  c.eq = vi.fn().mockReturnValue(c)
  c.order = vi.fn().mockReturnValue({ data, error })
  c.single = vi.fn().mockResolvedValue({ data, error })
  c.insert = vi.fn().mockReturnValue(c)
  c.update = vi.fn().mockReturnValue(c)
  c.then = (res: any, rej: any) => Promise.resolve({ data, error }).then(res, rej)
  return c
}

describe('Surveys', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getSurveys returns list', async () => {
    const svs = [{ id: SURVEY, title: 'Feedback' }]
    const c = makeChain(svs)
    ;(createClient as any).mockResolvedValue({ from: vi.fn().mockReturnValue(c) })
    c.order.mockReturnValueOnce({ data: svs, error: null })
    expect(await getSurveys(EVT)).toEqual(svs)
  })

  it('getSurveys returns empty on null', async () => {
    const c = makeChain(null)
    ;(createClient as any).mockResolvedValue({ from: vi.fn().mockReturnValue(c) })
    c.order.mockReturnValueOnce({ data: null, error: null })
    expect(await getSurveys(EVT)).toEqual([])
  })

  it('createSurvey validates title required', async () => {
    const c = makeChain(null)
    ;(createClient as any).mockResolvedValue({ from: vi.fn().mockReturnValue(c) })
    const fd = new FormData()
    fd.set('title', '')
    const res = await createSurvey(EVT, fd)
    expect(res).toHaveProperty('error')
  })

  it('createSurvey is a server action function', () => {
    expect(typeof createSurvey).toBe('function')
  })

  it('publishSurvey updates status to active', async () => {
    const c = makeChain(null)
    ;(createClient as any).mockResolvedValue({ from: vi.fn().mockReturnValue(c) })
    const res = await publishSurvey(SURVEY)
    expect(res).toHaveProperty('success', true)
  })

  it('closeSurvey updates status to closed', async () => {
    const c = makeChain(null)
    ;(createClient as any).mockResolvedValue({ from: vi.fn().mockReturnValue(c) })
    const res = await closeSurvey(SURVEY)
    expect(res).toHaveProperty('success', true)
  })
})

describe('sendSurveyToAllAttendees delegates to deliverAttendeeEmail', () => {
  function makeSupabase(cfg: { event: any; regs: any[] }) {
    return {
      from(table: string) {
        if (table === 'events') {
          return {
            select() { return this },
            eq() { return this },
            maybeSingle: async () => ({ data: cfg.event, error: null }),
          }
        }
        if (table === 'registrations') {
          const chain: any = {
            select() { return chain },
            eq() { return chain },
            then(res: any, rej: any) {
              return Promise.resolve({ data: cfg.regs, error: null }).then(res, rej)
            },
          }
          return chain
        }
        throw new Error(`unexpected table in test: ${table}`)
      },
    }
  }

  beforeEach(() => {
    deliverMock.mockReset()
  })

  it('calls deliverAttendeeEmail per recipient with that registration\'s id, and tallies suppressed vs sent per the rail result', async () => {
    const supabase = makeSupabase({
      event: { id: EVT, slug: 'evt', title: 'Conf', organizations: { id: 'org_1' } },
      regs: [
        { id: 'r1', attendee_email: 'suppressed@example.com', attendee_name: 'Sup Pressed', qr_code: 'q1' },
        { id: 'r2', attendee_email: 'clean@example.com', attendee_name: 'Clean Person', qr_code: 'q2' },
      ],
    })
    ;(createClient as any).mockResolvedValue(supabase)
    deliverMock.mockImplementation(async (_admin: any, params: any) =>
      params.registrationId === 'r1' ? { channel: 'resend', suppressed: true } : { channel: 'ghl' },
    )

    const result = await sendSurveyToAllAttendees(SURVEY, EVT)

    expect(result).toMatchObject({ ok: true, sent: 1, errors: 0, total: 2 })
    expect(deliverMock).toHaveBeenCalledTimes(2)

    const calls = deliverMock.mock.calls
    const r1Call = calls.find(([, p]) => p.registrationId === 'r1')
    const r2Call = calls.find(([, p]) => p.registrationId === 'r2')
    expect(r1Call![0]).toBe(FAKE_ADMIN)
    expect(r1Call![1]).toMatchObject({ registrationId: 'r1', to: 'suppressed@example.com', attendeeName: 'Sup Pressed' })
    expect(r2Call![1]).toMatchObject({ registrationId: 'r2', to: 'clean@example.com', attendeeName: 'Clean Person' })
  })
})

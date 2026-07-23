import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn().mockResolvedValue({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }) }))
vi.mock('@/lib/auth/assert-permission', () => ({ assertPermission: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

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

describe('sendSurveyToAllAttendees suppression gate', () => {
  const fetchMock = vi.fn()

  function makeSupabase(cfg: { event: any; regs: any[]; suppressions: any[] }) {
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
        if (table === 'email_suppressions') {
          const chain: any = {
            select() { return chain },
            then(res: any, rej: any) {
              return Promise.resolve({ data: cfg.suppressions, error: null }).then(res, rej)
            },
          }
          return chain
        }
        throw new Error(`unexpected table in test: ${table}`)
      },
    }
  }

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-resend-key'
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ id: 'email-1' }) })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does NOT send to a suppressed recipient but DOES send to a non-suppressed one', async () => {
    const supabase = makeSupabase({
      event: { id: EVT, slug: 'evt', title: 'Conf', organizations: { id: 'org_1' } },
      regs: [
        { id: 'r1', attendee_email: 'suppressed@example.com', attendee_name: 'Sup Pressed', qr_code: 'q1' },
        { id: 'r2', attendee_email: 'clean@example.com', attendee_name: 'Clean Person', qr_code: 'q2' },
      ],
      suppressions: [{ email: 'suppressed@example.com' }],
    })
    ;(createClient as any).mockResolvedValue(supabase)

    const result = await sendSurveyToAllAttendees(SURVEY, EVT)

    expect(result).toMatchObject({ ok: true, sent: 1, errors: 0 })
    const recipients = fetchMock.mock.calls.map((c: any[]) => JSON.parse(c[1].body).to)
    expect(recipients).not.toContain('suppressed@example.com')
    expect(recipients).toContain('clean@example.com')
  })
})

// Batch H3 (O168, H-R3): re-inviting a declined volunteer (status declined or
// no_show, or shift_response 'declined') resets them to invited with no
// response before the invite goes out; a confirmed or checked-in volunteer is
// not changed; an update error or a failed enqueue says "Could not send the
// invite." Both the dashboard route and the embedded action.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import('./helpers/fake-db').createFakeDb>,
  invite: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: 'embed-token' }) })) }))
vi.mock('@/lib/embedded/session', () => ({ COOKIE_NAME: 'pz_embed', verifyEmbeddedSession: vi.fn(async () => ({ location_id: 'loc-1' })) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.db.client }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: 'u1' })) }))
vi.mock('@/lib/auth/assert-permission', () => ({ assertPermission: vi.fn(async () => undefined) }))
vi.mock('@/lib/ratelimit', async () => (await import('./helpers/auto-mock')).autoMockModule({
  checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 9 })),
}))
vi.mock('@/lib/trigger', async () => (await import('./helpers/auto-mock')).autoMockModule({ enqueueVolunteerInvite: h.invite }))

import { POST as resendRoute } from '@/app/api/events/[id]/volunteers/[volunteerId]/resend/route'
import { embedResendVolunteerInvite } from '@/lib/embedded/volunteers-actions'
import { isVolunteerActive } from '@/lib/volunteers/active'

const EVENT = { id: 'e1', org_id: 'o1', slug: 'conf', title: 'Conf', start_at: '2026-10-06T19:00:00Z', timezone: 'America/New_York' }

function seed(v: Record<string, unknown>, opts: { failWrite?: boolean } = {}) {
  h.db = createFakeDb(
    {
      events: [EVENT],
      ghl_location_links: [{ ghl_location_id: 'loc-1', org_id: 'o1' }],
      volunteers: [{
        id: 'v1', event_id: 'e1', name: 'Val', email: 'val@x.com', role: 'check-in', portal_access_token: 'tok',
        shift_response_at: '2026-09-20T00:00:00Z', shift_decline_reason: 'busy', events: EVENT, ...v,
      }],
    },
    opts.failWrite ? { failWrite: { volunteers: { code: 'XX000', message: 'boom' } } } : {},
  )
}
const row = () => h.db.tables.volunteers[0]

const paths = [
  ['dashboard route', async () => {
    const res = await resendRoute(new Request('https://prezva.app/x', { method: 'POST' }), { params: Promise.resolve({ id: 'conf', volunteerId: 'v1' }) })
    const body = await res.json()
    return res.ok ? body : { error: body.error }
  }],
  ['embedded action', () => embedResendVolunteerInvite('v1', 'e1')],
] as const

describe.each(paths)('%s', (_n, resend) => {
  beforeEach(() => h.invite.mockReset().mockResolvedValue({ id: 'run-1' }))

  it.each([
    ['status declined', { status: 'declined', shift_response: null }],
    ['status no_show', { status: 'no_show', shift_response: null }],
    ['shift_response declined', { status: 'invited', shift_response: 'declined' }],
  ])('%s → reset to invited, then emailed; token kept', async (_l, v) => {
    seed(v)
    expect(await resend()).toEqual({ ok: true })
    expect(row()).toMatchObject({ status: 'invited', shift_response: null, shift_response_at: null, shift_decline_reason: null, portal_access_token: 'tok' })
    expect(h.invite).toHaveBeenCalledTimes(1)
    expect(h.invite.mock.calls[0][0]).toMatchObject({ volunteerEmail: 'val@x.com', portalUrl: expect.stringContaining('/volunteer/tok') })
    // G-R5: the reset volunteer can check in again.
    expect(isVolunteerActive(row())).toBe(true)
  })

  it.each([
    ['confirmed', { status: 'confirmed', shift_response: 'confirmed' }],
    ['checked_in', { status: 'checked_in', shift_response: 'confirmed' }],
  ])('%s → unchanged, still emailed', async (_l, v) => {
    seed(v)
    expect(await resend()).toEqual({ ok: true })
    expect(row()).toMatchObject({ ...v, shift_decline_reason: 'busy' })
    expect(h.db.writes.filter(w => w.table === 'volunteers')).toEqual([])
    expect(h.invite).toHaveBeenCalledTimes(1)
  })

  it('an update error → "Could not send the invite." and no email', async () => {
    seed({ status: 'declined' }, { failWrite: true })
    expect(await resend()).toEqual({ error: 'Could not send the invite.' })
    expect(h.invite).not.toHaveBeenCalled()
  })

  it('a null enqueue result → "Could not send the invite."', async () => {
    seed({ status: 'confirmed' })
    h.invite.mockResolvedValue(null)
    expect(await resend()).toEqual({ error: 'Could not send the invite.' })
  })

  it('a failed enqueue after a reset puts the declined volunteer back as they were', async () => {
    seed({ status: 'no_show', shift_response: 'declined' })
    h.invite.mockResolvedValue(null)
    expect(await resend()).toEqual({ error: 'Could not send the invite.' })
    expect(row()).toMatchObject({ status: 'no_show', shift_response: 'declined', shift_response_at: '2026-09-20T00:00:00Z', shift_decline_reason: 'busy' })
    expect(isVolunteerActive(row())).toBe(false)
  })
})

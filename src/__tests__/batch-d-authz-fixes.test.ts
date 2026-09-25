// Batch D commit 3: dead-letter replay (O140, D-R4), wallet passes (O141,
// D-R5) and the sponsor portal invite (O143, D-R7) follow the ratified
// authorization pattern and never report a fake success.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({ db: null as any, allowed: new Set<string>(), sessionUser: null as null | { id: string; email?: string } }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.db.client) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ ...h.db.client, auth: { getUser: async () => ({ data: { user: h.sessionUser } }) } })),
}))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('@/lib/auth/assert-permission', async () => {
  const { PermissionError } = await import('@/lib/auth/permission-error')
  return {
    assertPermission: vi.fn(async (org: string, _u: string, key: string) => {
      if (!h.allowed.has(`${org}:${key}`)) throw new PermissionError(key)
    }),
  }
})
const googleMock = vi.hoisted(() => vi.fn(async () => ({ url: 'https://pay.google.com/gp/v/save/jwt' })))
const appleMock = vi.hoisted(() => vi.fn(async () => ({ buffer: Buffer.from('pkpass') })))
vi.mock('@/lib/passes/google-wallet', () => ({ generateGoogleWalletUrl: googleMock }))
vi.mock('@/lib/passes/apple-pass', () => ({ generateAppleWalletPass: appleMock }))

import { POST as replay } from '@/app/api/events/[id]/dead-letters/[letterId]/replay/route'
import { GET as googlePass } from '@/app/api/passes/google/[registrationId]/route'
import { GET as applePass } from '@/app/api/passes/apple/[registrationId]/route'
import { sendSponsorPortalInvite } from '@/lib/sponsors/portal-actions'

const ctx = (id: string, letterId: string) => ({ params: Promise.resolve({ id, letterId }) })

describe('dead-letter replay (D-R4)', () => {
  beforeEach(() => {
    h.allowed = new Set(['orgA:failed_jobs.manage'])
    h.db = createFakeDb({
      events: [{ id: 'e1', slug: 'conf', org_id: 'orgA' }, { id: 'e2', slug: 'other', org_id: 'orgB' }],
      dead_letter_items: [
        { id: 'd1', type: 'check_in_sync', event_id: 'e1', retry_count: 0, payload: {} },
        { id: 'd0', type: 'check_in_sync', event_id: null, retry_count: 0, payload: {} },
      ],
    })
  })

  it('accepts the event slug the dashboard sends and answers an unsupported type with 422', async () => {
    const res = await replay(new Request('http://x'), ctx('conf', 'd1'))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'Replay not supported for check_in_sync' })
    expect(h.db.writesTo('dead_letter_items')).toEqual([])
  })

  it('accepts the event id too', async () => {
    expect((await replay(new Request('http://x'), ctx('e1', 'd1'))).status).toBe(422)
  })

  it('refuses an item with no event', async () => {
    expect((await replay(new Request('http://x'), ctx('conf', 'd0'))).status).toBe(404)
    expect(h.db.writesTo('dead_letter_items')).toEqual([])
  })

  it('refuses a URL event that is not the item’s event', async () => {
    h.allowed.add('orgB:failed_jobs.manage')
    expect((await replay(new Request('http://x'), ctx('other', 'd1'))).status).toBe(404)
  })

  it('refuses a caller without failed_jobs.manage on the item’s org', async () => {
    h.allowed = new Set()
    expect((await replay(new Request('http://x'), ctx('conf', 'd1'))).status).toBe(403)
  })
})

describe('wallet passes (D-R5)', () => {
  const reg = (id: string, status: string, extra: Record<string, any> = {}) =>
    ({ id, status, qr_code: `qr-${id}`, user_id: null, attendee_email: `${id}@x.test`, ...extra })
  const req = (id: string, t?: string, kind: 'google' | 'apple' = 'google') =>
    new NextRequest(`http://x/api/passes/${kind}/${id}${t === undefined ? '' : `?t=${encodeURIComponent(t)}`}`)
  const params = (registrationId: string) => ({ params: Promise.resolve({ registrationId }) })

  beforeEach(() => {
    googleMock.mockClear()
    appleMock.mockClear()
    h.sessionUser = null
    h.db = createFakeDb({
      registrations: [
        reg('r-ok', 'confirmed'),
        reg('r-pending', 'pending'), reg('r-wait', 'waitlisted'), reg('r-cancel', 'cancelled'), reg('r-refund', 'refunded'),
        reg('r-owned', 'confirmed', { user_id: 'u-owner' }),
      ],
    })
  })

  it.each(['r-pending', 'r-wait', 'r-cancel', 'r-refund'])('refuses a %s registration even with the right token (both routes)', async id => {
    const g = await googlePass(req(id, `qr-${id}`), params(id))
    const a = await applePass(req(id, `qr-${id}`, 'apple'), params(id))
    expect(g.status).toBe(403)
    expect(a.status).toBe(403)
    expect(googleMock).not.toHaveBeenCalled()
    expect(appleMock).not.toHaveBeenCalled()
  })

  it('refuses a wrong or missing ?t= with a plain 404 (both routes)', async () => {
    expect((await googlePass(req('r-ok', 'qr-r-pending'), params('r-ok'))).status).toBe(404)
    expect((await googlePass(req('r-ok'), params('r-ok'))).status).toBe(404)
    expect((await applePass(req('r-ok', 'nope', 'apple'), params('r-ok'))).status).toBe(404)
    expect((await applePass(req('r-ok', undefined, 'apple'), params('r-ok'))).status).toBe(404)
    // A stranger learns nothing about another registration's status.
    expect((await googlePass(req('r-cancel', 'guess'), params('r-cancel'))).status).toBe(404)
    expect(googleMock).not.toHaveBeenCalled()
    expect(appleMock).not.toHaveBeenCalled()
  })

  it('issues a pass for the ticket token on a confirmed registration', async () => {
    const g = await googlePass(req('r-ok', 'qr-r-ok'), params('r-ok'))
    expect(g.status).toBe(307)
    expect(googleMock).toHaveBeenCalledWith('r-ok')
    const a = await applePass(req('r-ok', 'qr-r-ok', 'apple'), params('r-ok'))
    expect(a.status).toBe(200)
    expect(a.headers.get('content-type')).toBe('application/vnd.apple.pkpass')
    expect(appleMock).toHaveBeenCalledWith('r-ok')
  })

  it('allows the signed-in owner without a token; another signed-in user is refused', async () => {
    h.sessionUser = { id: 'u-owner' }
    expect((await googlePass(req('r-owned'), params('r-owned'))).status).toBe(307)
    expect((await applePass(req('r-owned', undefined, 'apple'), params('r-owned'))).status).toBe(200)
    h.sessionUser = { id: 'u-stranger', email: 'stranger@x.test' }
    expect((await googlePass(req('r-owned'), params('r-owned'))).status).toBe(404)
  })
})

describe('sponsor portal invite (D-R7)', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    h.allowed = new Set()
    h.db = createFakeDb({
      event_sponsors: [{
        id: 's1', name: '<b>Acme</b>', slug: 'acme', contact_email: 'acme@x.test', portal_access_token: 'pat', event_id: 'e1',
        events: { title: 'Conf <i>', slug: 'conf', org_id: 'orgA', organizations: { name: 'Org & Co' } },
      }],
    })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('without sponsors.manage returns { error } and sends nothing', async () => {
    const res = await sendSponsorPortalInvite('s1')
    expect(res).toHaveProperty('error')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('with permission sends one email with the sponsor, event and org names escaped', async () => {
    h.allowed = new Set(['orgA:sponsors.manage'])
    expect(await sendSponsorPortalInvite('s1')).toEqual({ ok: true })
    const html = JSON.parse(fetchMock.mock.calls[0][1].body).html as string
    expect(html).toContain('&lt;b&gt;Acme&lt;/b&gt;')
    expect(html).toContain('Conf &lt;i&gt;')
    expect(html).toContain('Org &amp; Co')
    expect(html).not.toContain('<b>Acme</b>')
  })
})

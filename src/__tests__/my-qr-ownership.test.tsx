import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

// /my-qr ownership after O102 moved its (a)/(b) branches into resolveOwnedRegistration.
// The page must hand out QR + PIN to exactly the same callers as before (GE-6b).

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue('1.2.3.4') }),
}))
vi.mock('@/lib/ratelimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ limited: false }),
  myQrLimiter: null,
}))
vi.mock('@/lib/auth/session-identity', () => ({ getSessionIdentity: vi.fn() }))
vi.mock('@/app/e/[slug]/my-qr/qr-display', () => ({ default: () => null }))

type Row = Record<string, unknown>
let db: Record<string, Row[]>
function table(name: string) {
  const filters: [string, unknown][] = []
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => { filters.push([c, v]); return q },
    maybeSingle: async () => ({ data: (db[name] ?? []).filter(r => filters.every(([c, v]) => r[c] === v))[0] ?? null, error: null }),
  }
  return q
}
const mockGetUser = vi.fn()
const fakeClient = { from: (t: string) => table(t), auth: { getUser: mockGetUser } }
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fakeClient) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(() => Promise.resolve(fakeClient)) }))

import MyQRPage from '@/app/e/[slug]/my-qr/page'
import QRDisplay from '@/app/e/[slug]/my-qr/qr-display'
import { getSessionIdentity, type SessionIdentity } from '@/lib/auth/session-identity'

const EVENT = 'e1'
const OTHER_EVENT = 'e2'
const USER_ID = 'u1'

function shownQr(node: ReactNode): string | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const n of node) { const f = shownQr(n); if (f !== null) return f }
    return null
  }
  const el = node as ReactElement<{ qrCode?: string; children?: ReactNode }>
  if (el.type === QRDisplay) return el.props.qrCode ?? ''
  return shownQr(el.props?.children)
}

async function visit(identity: SessionIdentity, search: { email?: string; pin?: string } = {}, authEmail?: string) {
  vi.mocked(getSessionIdentity).mockResolvedValue(identity)
  mockGetUser.mockResolvedValue({ data: { user: authEmail ? { id: USER_ID, email: authEmail } : null } })
  const el = await MyQRPage({ params: Promise.resolve({ slug: 'here' }), searchParams: Promise.resolve(search) })
  return shownQr(el)
}

beforeEach(() => {
  db = {
    events: [{ id: EVENT, title: 'Here', slug: 'here' }, { id: OTHER_EVENT, title: 'Other', slug: 'other' }],
    registrations: [
      { id: 'r-linked', event_id: EVENT, user_id: USER_ID, attendee_email: 'linked@test.com', status: 'confirmed', qr_code: 'qr-linked', pin: '1111', attendee_name: 'L' },
      { id: 'r-email', event_id: EVENT, user_id: null, attendee_email: 'email@test.com', status: 'confirmed', qr_code: 'qr-email', pin: '2222', attendee_name: 'E' },
      { id: 'r-pending', event_id: EVENT, user_id: null, attendee_email: 'pending@test.com', status: 'pending', qr_code: 'qr-pending', pin: '3333', attendee_name: 'P' },
      { id: 'r-other', event_id: OTHER_EVENT, user_id: null, attendee_email: 'other@test.com', status: 'confirmed', qr_code: 'qr-other', pin: '4444', attendee_name: 'O' },
    ],
  }
})

describe('/my-qr ownership (unchanged by O102)', () => {
  it('full auth: shows the reg linked by user_id', async () => {
    expect(await visit({ type: 'user', userId: USER_ID })).toBe('qr-linked')
  })

  it('full auth: falls back to the verified auth email, lower-cased', async () => {
    expect(await visit({ type: 'user', userId: 'u-unlinked' }, {}, 'EMAIL@test.com')).toBe('qr-email')
  })

  it('full auth: never uses the email+PIN query even when supplied', async () => {
    expect(await visit({ type: 'user', userId: 'u-unlinked' }, { email: 'email@test.com', pin: '2222' })).toBeNull()
  })

  it('full auth: a pending reg is not shown', async () => {
    expect(await visit({ type: 'user', userId: 'u-unlinked' }, {}, 'pending@test.com')).toBeNull()
  })

  it('claim-level for this event: shows that reg', async () => {
    expect(await visit({ type: 'registration', registrationId: 'r-email', eventId: EVENT })).toBe('qr-email')
  })

  it('claim-level for another event: falls through to email+PIN exactly as before', async () => {
    expect(await visit({ type: 'registration', registrationId: 'r-other', eventId: OTHER_EVENT })).toBeNull()
    expect(await visit({ type: 'registration', registrationId: 'r-other', eventId: OTHER_EVENT }, { email: 'email@test.com', pin: '2222' })).toBe('qr-email')
  })

  it('anonymous: email + correct PIN shows the reg; email alone or a wrong PIN does not', async () => {
    expect(await visit({ type: 'anonymous' }, { email: 'Email@Test.com', pin: '2222' })).toBe('qr-email')
    expect(await visit({ type: 'anonymous' }, { email: 'email@test.com' })).toBeNull()
    expect(await visit({ type: 'anonymous' }, { email: 'email@test.com', pin: '9999' })).toBeNull()
  })

  it('anonymous: a pending reg is not shown even with the right PIN', async () => {
    expect(await visit({ type: 'anonymous' }, { email: 'pending@test.com', pin: '3333' })).toBeNull()
  })
})

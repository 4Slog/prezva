// Batch H2 (O169, H-R2): volunteer self-signup is closed for launch — the
// action refuses before any read, write or email, the page is a 404, and the
// attendee menu no longer links to it. Organizer invites are unchanged.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { execFileSync } from 'node:child_process'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import('./helpers/fake-db').createFakeDb>,
  invite: vi.fn(async () => ({ id: 'run-1' })),
}))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  usePathname: () => '/e/conf',
  redirect: vi.fn(),
}))
vi.mock('@/components/layout/NotificationBell', () => ({ NotificationBell: () => null }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.db.client }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.db.client }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: 'u1' })) }))
vi.mock('@/lib/auth/assert-permission', () => ({ assertPermission: vi.fn(async () => undefined) }))
vi.mock('@/lib/ratelimit', async () => (await import('./helpers/auto-mock')).autoMockModule({
  checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 9 })),
}))
vi.mock('@/lib/trigger', async () => (await import('./helpers/auto-mock')).autoMockModule({ enqueueVolunteerInvite: h.invite }))
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn(async () => undefined) }))

import { signupAsVolunteer } from '@/lib/volunteers/actions'
import VolunteerSignupPage from '@/app/e/[slug]/volunteer/page'
import { AttendeeShell } from '@/components/attendee/AttendeeShell'
import { POST as addVolunteer } from '@/app/api/events/[id]/volunteers/route'
import { POST as resendInvite } from '@/app/api/events/[id]/volunteers/[volunteerId]/resend/route'

const fetchMock = vi.fn()
beforeEach(() => {
  h.invite.mockClear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  h.db = createFakeDb({
    events: [{ id: 'e1', org_id: 'o1', slug: 'conf', title: 'Conf', status: 'published', start_at: '2026-10-06T19:00:00Z', timezone: 'America/New_York' }],
    volunteers: [],
  })
})

describe('self-signup', () => {
  it('refuses with the fixed message, before any read, write or email', async () => {
    const res = await signupAsVolunteer('e1', 'Eve', 'eve@x.com', null, 'check-in', null)
    expect(res).toEqual({ error: 'Volunteer applications are not open.' })
    expect(h.db.writes).toEqual([])
    expect(h.db.client.from).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(h.db.tables.volunteers).toEqual([])
  })

  it('/e/[slug]/volunteer is a 404 for a published event', () => {
    expect(() => VolunteerSignupPage()).toThrow('NEXT_NOT_FOUND')
  })

  it('the attendee More menu has no Volunteer item', () => {
    render(<AttendeeShell event={{ title: 'Conf', slug: 'conf' }} hasRegistration><div /></AttendeeShell>)
    for (const more of screen.getAllByText('More')) fireEvent.click(more)
    expect(screen.getAllByText('Speakers').length).toBeGreaterThan(0) // the menu is open
    expect(screen.queryByText('Volunteer')).not.toBeInTheDocument()
    expect(document.querySelector('a[href="/e/conf/volunteer"]')).toBeNull()
  })

  it('nothing in src links to the signup page', () => {
    let out = ''
    try {
      out = execFileSync('grep', ['-rnE', '/e/[^\'"`]*/volunteer[\'"`]|\\$\\{base\\}/volunteer[\'"`]', 'src', '--include=*.ts', '--include=*.tsx', '--exclude-dir=__tests__'], { encoding: 'utf8' })
    } catch (e) { out = (e as { stdout?: string }).stdout ?? '' }
    expect(out.trim()).toBe('')
  })
})

describe('organizer invites are unchanged', () => {
  it('add a volunteer and send the invite', async () => {
    const res = await addVolunteer(
      new Request('https://prezva.app/api/events/conf/volunteers', {
        method: 'POST',
        body: JSON.stringify({ event_id: '11111111-1111-4111-8111-111111111111', name: 'Val', email: 'val@x.com', role: 'check-in' }),
      }) as never,
      { params: Promise.resolve({ id: 'conf' }) } as never,
    )
    expect(res.status).toBeLessThan(300)
    expect(h.db.tables.volunteers).toHaveLength(1)
    expect(h.db.tables.volunteers[0]).toMatchObject({ email: 'val@x.com', role: 'check-in', status: 'invited' })
    expect(h.invite).toHaveBeenCalledTimes(1)
  })

  it('resend the invite', async () => {
    h.db.tables.volunteers.push({ id: 'v1', event_id: 'e1', name: 'Val', email: 'val@x.com', role: 'check-in', status: 'confirmed', portal_access_token: 'tok' })
    const res = await resendInvite(new Request('https://prezva.app/x', { method: 'POST' }), { params: Promise.resolve({ id: 'e1', volunteerId: 'v1' }) })
    expect(res.status).toBe(200)
    expect(h.invite).toHaveBeenCalledTimes(1)
  })
})

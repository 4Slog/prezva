// Batch C commit 3 (O132): volunteer remove works with the dashboard's slug,
// is scoped to the volunteer's own event, errors on zero rows (route and
// embedded action), and the dashboard shows the error instead of dropping it.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({ db: null as any, allowed: new Set<string>() }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.db.client) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.db.client) }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('@/lib/auth/assert-permission', async () => {
  const { PermissionError } = await import('@/lib/auth/permission-error')
  return {
    assertPermission: vi.fn(async (org: string, _u: string, key: string) => {
      if (!h.allowed.has(`${org}:${key}`)) throw new PermissionError(key)
    }),
  }
})
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: 'embed' }) })) }))
vi.mock('@/lib/embedded/session', () => ({ verifyEmbeddedSession: vi.fn(async () => ({ location_id: 'loc-a' })), COOKIE_NAME: 'x' }))
vi.mock('@/lib/trigger', async () => (await import('./helpers/auto-mock')).autoMockModule())
vi.mock('@/lib/volunteers/actions', () => ({ resolveVolunteerAlert: vi.fn(), exportVolunteerHours: vi.fn() }))

import { POST as removeRoute } from '@/app/api/events/[id]/volunteers/[volunteerId]/remove/route'
import { embedRemoveVolunteer } from '@/lib/embedded/volunteers-actions'
import { VolunteersClient } from '@/app/(dashboard)/events/[slug]/volunteers/volunteers-client'

beforeEach(() => {
  vi.clearAllMocks()
  h.allowed = new Set()
  h.db = createFakeDb({
    events: [
      { id: 'e1', org_id: 'orgA', slug: 'ev-a', title: 'A', start_at: '2026-10-06T19:00:00Z', timezone: 'America/New_York' },
      { id: 'e2', org_id: 'orgB', slug: 'ev-b', title: 'B', start_at: '2026-10-06T19:00:00Z', timezone: 'America/New_York' },
    ],
    volunteers: [
      { id: 'v1', event_id: 'e1', name: 'Val' },
      { id: 'v2', event_id: 'e2', name: 'Bob' },
    ],
    ghl_location_links: [{ ghl_location_id: 'loc-a', org_id: 'orgA' }],
  })
})

const call = (eventRef: string, volunteerId: string) =>
  removeRoute(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id: eventRef, volunteerId }) })
const deletes = () => h.db.writesTo('volunteers')

describe('remove route', () => {
  it('removes with the event slug the dashboard sends (was always 404)', async () => {
    h.allowed.add('orgA:volunteers.manage')
    const res = await call('ev-a', 'v1')
    expect(res.status).toBe(200)
    expect(deletes()).toHaveLength(1)
    expect(h.db.tables.volunteers.map((v: any) => v.id)).toEqual(['v2'])
  })

  it('refuses a stranger and another event\'s volunteer; deletes nothing', async () => {
    expect((await call('ev-a', 'v1')).status).toBe(403)
    h.allowed.add('orgA:volunteers.manage')
    expect((await call('ev-a', 'v2')).status).toBe(404)
    expect((await call('ev-b', 'v2')).status).toBe(403)
    expect(deletes()).toEqual([])
  })

  it('a volunteer that is already gone is a 404, not a silent ok', async () => {
    h.allowed.add('orgA:volunteers.manage')
    expect((await call('ev-a', 'v1')).status).toBe(200)
    expect((await call('ev-a', 'v1')).status).toBe(404)
  })
})

describe('embedRemoveVolunteer', () => {
  it('errors on zero rows (wrong event\'s volunteer, or already gone)', async () => {
    expect(await embedRemoveVolunteer('v2', 'e1')).toHaveProperty('error')
    expect(await embedRemoveVolunteer('v1', 'e1')).toEqual({ ok: true })
    expect(await embedRemoveVolunteer('v1', 'e1')).toHaveProperty('error')
  })
})

describe('dashboard handleAction', () => {
  it('shows the remove error and keeps the row', async () => {
    vi.stubGlobal('confirm', () => true)
    const removeAction = vi.fn(async () => ({ error: 'Not found' as string }))
    render(
      <VolunteersClient
        eventId="e1" eventSlug="ev-a" eventTimezone="America/New_York"
        volunteers={[{ id: 'v1', name: 'Val', email: null, phone: null, role: 'general', status: 'invited', portal_access_token: 't' } as any]}
        sessions={[]} alerts={[]} permissions={['volunteers.manage']}
        removeAction={removeAction}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Not found'))
    expect(screen.getByText('Val')).toBeTruthy()
    vi.unstubAllGlobals()
  })
})

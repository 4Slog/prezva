// Batch D commit 5 (O145): the admin tile badges count real tables. Before,
// four of the five queries named a table or column that never existed, so the
// tiles were always blank.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.db.client) }))

import { getAdminTileBadges } from '@/lib/events/admin-tile-counts'

const post = (id: string, event_id: string) => ({ id, event_id })

beforeEach(() => {
  h.db = createFakeDb({
    speakers: [
      { id: 'sp1', event_id: 'e1', status: 'invited' },
      { id: 'sp2', event_id: 'e1', status: 'invited' },
      { id: 'sp3', event_id: 'e1', status: 'confirmed' },
      { id: 'sp4', event_id: 'e1', status: 'declined' },
      { id: 'sp9', event_id: 'e2', status: 'invited' },
    ],
    surveys: [
      { id: 'sv1', event_id: 'e1', status: 'active' },
      { id: 'sv2', event_id: 'e1', status: 'draft' },
      { id: 'sv3', event_id: 'e1', status: 'closed' },
      { id: 'sv9', event_id: 'e2', status: 'active' },
    ],
    attendee_profiles: [
      { id: 'ap1', event_id: 'e1', is_visible: true },
      { id: 'ap2', event_id: 'e1', is_visible: true },
      { id: 'ap3', event_id: 'e1', is_visible: true },
      { id: 'ap4', event_id: 'e1', is_visible: false },
      { id: 'ap9', event_id: 'e2', is_visible: true },
    ],
    // The fake does not resolve embeds; the joined post rides on the row.
    community_reports: [
      { id: 'cr1', resolved_at: null, community_posts: post('p1', 'e1') },
      { id: 'cr2', resolved_at: '2026-09-01T00:00:00Z', community_posts: post('p1', 'e1') },
      { id: 'cr9', resolved_at: null, community_posts: post('p9', 'e2') },
    ],
  })
})

describe('getAdminTileBadges', () => {
  it('counts invited speakers, active surveys, visible profiles and open reports — for this event only', async () => {
    expect(await getAdminTileBadges('e1')).toEqual({
      speakers: { key: 'speakers', label: '2 pending', variant: 'warning' },
      surveys: { key: 'surveys', label: '1 active' },
      networking: { key: 'networking', label: '3 opted in', variant: 'info' },
      community: { key: 'community', label: '1 reported', variant: 'error' },
    })
  })

  it('reads only tables that exist, with their real columns', async () => {
    await getAdminTileBadges('e1')
    const tables = h.db.client.from.mock.calls.map((c: string[]) => c[0]).sort()
    expect(tables).toEqual(['attendee_profiles', 'community_reports', 'speakers', 'surveys'])
  })

  it('shows no badge for an event with nothing to flag', async () => {
    expect(await getAdminTileBadges('e-empty')).toEqual({})
  })

  it('logs a failed count instead of silently reading it as zero', async () => {
    const from = h.db.client.from
    h.db.client.from = vi.fn((t: string) => {
      const b = from(t)
      if (t === 'surveys') b.then = (ok: any) => Promise.resolve({ data: null, count: null, error: { message: 'column does not exist' } }).then(ok)
      return b
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const badges = await getAdminTileBadges('e1')
    expect(badges.surveys).toBeUndefined()
    expect(badges.speakers).toBeDefined()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('surveys count failed: column does not exist'))
    log.mockRestore()
  })
})

// Batch E3: video names never expose attendee email (#11-14); bookmarks toggle
// on the real (user_id, session_id) key with the user from the session (#3).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({ db: null as any, user: null as any }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.db.client) }))

describe('video display name (#11-14)', () => {
  it('uses profiles.full_name', async () => {
    const { videoDisplayName } = await import('@/lib/video/display-name')
    const db = createFakeDb({ profiles: [{ id: 'u1', full_name: '  Ann Lee ', email: 'ann@x.com' }] })
    expect(await videoDisplayName(db.client, 'u1')).toBe('Ann Lee')
    expect(db.client.from).toHaveBeenCalledWith('profiles')
  })

  it('falls back to "Attendee" — never the email or the id — when there is no name or the read fails', async () => {
    const { videoDisplayName } = await import('@/lib/video/display-name')
    expect(await videoDisplayName(createFakeDb({ profiles: [{ id: 'u1', full_name: null, email: 'ann@x.com' }] }).client, 'u1')).toBe('Attendee')
    expect(await videoDisplayName(createFakeDb({ profiles: [{ id: 'u1', full_name: '   ', email: 'ann@x.com' }] }).client, 'u1')).toBe('Attendee')
    const failing: any = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'column profiles.display_name does not exist' } }) }) }) }) }
    expect(await videoDisplayName(failing, 'u1')).toBe('Attendee')
  })

  it.each([
    'src/app/api/video/token/route.ts',
    'src/lib/video/actions.ts',
    'src/app/e/[slug]/sessions/[sessionId]/live/page.tsx',
    'src/app/e/[slug]/meet/[inviteId]/page.tsx',
  ])('%s takes the name from the helper and never from email or display_name', (file) => {
    const src = readFileSync(join(process.cwd(), file), 'utf-8')
    expect(src).toContain('videoDisplayName(')
    expect(src).not.toMatch(/display_name/)
    expect(src).not.toMatch(/displayName\s*=[\s\S]{0,200}user\.email/)
  })
})

describe('setBookmark (#3)', () => {
  beforeEach(() => {
    h.db = createFakeDb(
      {
        session_bookmarks: [{ user_id: 'other', session_id: 's1' }],
        sessions: [{ id: 's1', is_published: true }, { id: 's-draft', is_published: false }],
      },
      { unique: { session_bookmarks: (a, b) => a.user_id === b.user_id && a.session_id === b.session_id } },
    )
    h.user = { id: 'u1' }
    h.db.client.auth = { getUser: vi.fn(async () => ({ data: { user: h.user } })) }
  })
  const mine = () => h.db.tables.session_bookmarks.filter((r: any) => r.user_id === 'u1')

  it('sets and clears by (user_id, session_id) for the signed-in user, idempotently', async () => {
    const { setBookmark } = await import('@/lib/public/bookmark-actions')
    expect(await setBookmark('s1', true)).toEqual({ bookmarked: true })
    expect(await setBookmark('s1', true)).toEqual({ bookmarked: true })
    expect(mine()).toHaveLength(1)
    expect(await setBookmark('s1', false)).toEqual({ bookmarked: false })
    expect(await setBookmark('s1', false)).toEqual({ bookmarked: false })
    expect(mine()).toHaveLength(0)
    // Another user's bookmark on the same session is untouched.
    expect(h.db.tables.session_bookmarks).toEqual([{ user_id: 'other', session_id: 's1' }])
  })

  it('takes no user id from the client', async () => {
    const { setBookmark } = await import('@/lib/public/bookmark-actions')
    expect(setBookmark.length).toBe(2)
    expect(await (setBookmark as unknown as (u: string, s: string, b: boolean) => Promise<unknown>)('other', 's1', false)).toEqual({ error: 'Invalid session' })
    expect(h.db.tables.session_bookmarks.find((r: any) => r.user_id === 'other')).toBeTruthy()
  })

  it('a draft (unpublished) session cannot be bookmarked', async () => {
    const { setBookmark } = await import('@/lib/public/bookmark-actions')
    expect(await setBookmark('s-draft', true)).toEqual({ error: 'Session not found' })
    expect(mine()).toEqual([])
  })

  it('signed out is refused and nothing is written', async () => {
    h.user = null
    const { setBookmark } = await import('@/lib/public/bookmark-actions')
    expect(await setBookmark('s1', true)).toEqual({ error: 'Sign in to bookmark sessions' })
    expect(h.db.writes).toEqual([])
  })

  it('surfaces a write error (generic text) instead of reporting success', async () => {
    h.db = createFakeDb({ session_bookmarks: [], sessions: [{ id: 's1', is_published: true }] }, { failInsert: { session_bookmarks: { code: '42501', message: 'permission denied for table session_bookmarks' } } })
    h.db.client.auth = { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) }
    const { setBookmark } = await import('@/lib/public/bookmark-actions')
    expect(await setBookmark('s1', true)).toEqual({ error: 'Could not update your bookmark. Please try again.' })
  })
})

// Batch G4 (O165, G-R4): an edit that omits a field leaves it unchanged — zod
// used to apply .default() under .partial(), so every edit re-published the
// session and reset sort_order/color. Create still defaults to published. The
// session form has a Published control; the agenda marks unpublished sessions.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({ server: null as unknown, admin: null as unknown }))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: 'embed-token' }) })) }))
vi.mock('@/lib/embedded/session', () => ({ COOKIE_NAME: 'pz_embed', verifyEmbeddedSession: vi.fn(async () => ({ location_id: 'loc-1' })) }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: 'u1', email: 'u@x.com' })) }))
vi.mock('@/lib/auth/assert-permission', () => ({ assertPermission: vi.fn(async () => undefined) }))
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.server }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))

import {
  createSession, updateSession, deleteSession, updateTrack, updateRoom, updateSpeaker, updateOrgSessionType,
} from '@/lib/agenda/actions'
import {
  embedCreateSession, embedUpdateSession, embedUpdateTrack, embedUpdateOrgSessionType,
} from '@/lib/embedded/agenda-actions'
import { SESSION_HAS_CHECKINS_ERROR } from '@/lib/agenda/session-delete'
import { SessionForm } from '@/components/agenda/SessionForm'
import { AgendaGrid } from '@/components/agenda/AgendaGrid'
import type { Session } from '@/lib/agenda/actions'

const ORG = 'org-1'
const EV = '11111111-1111-4111-8111-111111111111'
const S1 = '22222222-2222-4222-8222-222222222222'
const T1 = '33333333-3333-4333-8333-333333333333'
const R1 = '44444444-4444-4444-8444-444444444444'
const SP1 = '55555555-5555-4555-8555-555555555555'
const OT1 = '66666666-6666-4666-8666-666666666666'

let db: ReturnType<typeof createFakeDb>
beforeEach(() => {
  db = createFakeDb({
    events: [{ id: EV, org_id: ORG, timezone: 'America/New_York' }],
    org_members: [{ org_id: ORG, user_id: 'u1', role: 'staff' }],
    ghl_location_links: [{ ghl_location_id: 'loc-1', org_id: ORG }],
    sessions: [{ id: S1, event_id: EV, title: 'Old', session_type: 'panel', is_published: false, sort_order: 7 }],
    tracks: [{ id: T1, event_id: EV, name: 'Main', color: '#FF0000', sort_order: 4 }],
    rooms: [{ id: R1, event_id: EV, name: 'Hall', sort_order: 3 }],
    speakers: [{ id: SP1, event_id: EV, name: 'Ada', is_published: false, sort_order: 9 }],
    org_session_types: [{ id: OT1, org_id: ORG, slug: 'lab', label: 'Lab', color: '#00FF00', sort_order: 2 }],
  })
  h.server = db.client
  h.admin = db.client
})
const row = (table: string, id: string) => db.tables[table].find(r => r.id === id)!

describe.each([
  ['dashboard', (input: object) => updateSession(EV, S1, input)],
  ['embedded', (input: object) => embedUpdateSession(EV, S1, input)],
] as const)('%s session edit', (_n, update) => {
  it('omitting is_published keeps an unpublished session unpublished, and keeps sort_order and type', async () => {
    const res = await update({ title: 'New title' })
    expect((res as { error?: string }).error).toBeUndefined()
    expect(row('sessions', S1)).toMatchObject({ title: 'New title', is_published: false, sort_order: 7, session_type: 'panel' })
  })

  it('is_published true republishes and false unpublishes', async () => {
    await update({ is_published: true })
    expect(row('sessions', S1).is_published).toBe(true)
    await update({ is_published: false })
    expect(row('sessions', S1).is_published).toBe(false)
  })
})

describe('keep-on-omit for tracks, rooms, speakers and org session types', () => {
  it('track: color and sort_order survive a rename (dashboard and embedded)', async () => {
    await updateTrack(EV, T1, { name: 'Renamed' })
    expect(row('tracks', T1)).toMatchObject({ name: 'Renamed', color: '#FF0000', sort_order: 4 })
    await embedUpdateTrack(EV, T1, { name: 'Again' })
    expect(row('tracks', T1)).toMatchObject({ name: 'Again', color: '#FF0000', sort_order: 4 })
  })

  it('room: sort_order survives a rename', async () => {
    await updateRoom(EV, R1, { name: 'Ballroom' })
    expect(row('rooms', R1)).toMatchObject({ name: 'Ballroom', sort_order: 3 })
  })

  it('speaker: is_published and sort_order survive a bio edit', async () => {
    await updateSpeaker(EV, SP1, { bio: 'New bio' })
    expect(row('speakers', SP1)).toMatchObject({ bio: 'New bio', is_published: false, sort_order: 9 })
  })

  it('org session type: color and sort_order survive a relabel (dashboard and embedded)', async () => {
    await updateOrgSessionType(ORG, OT1, { label: 'Workshop Lab' })
    expect(row('org_session_types', OT1)).toMatchObject({ label: 'Workshop Lab', color: '#00FF00', sort_order: 2 })
    await embedUpdateOrgSessionType(ORG, OT1, { label: 'Hands On' })
    expect(row('org_session_types', OT1)).toMatchObject({ label: 'Hands On', color: '#00FF00', sort_order: 2 })
  })
})

describe('create still defaults to published', () => {
  const base = { title: 'New', starts_at: '2026-10-01T14:00:00.000Z', ends_at: '2026-10-01T15:00:00.000Z' }
  it('dashboard', async () => {
    const res = await createSession(EV, base)
    expect((res as { error?: string }).error).toBeUndefined()
    expect(db.tables.sessions.find(r => r.title === 'New')).toMatchObject({ is_published: true, sort_order: 0, session_type: 'talk' })
  })
  it('embedded', async () => {
    const res = await embedCreateSession(EV, base)
    expect((res as { error?: string }).error).toBeUndefined()
    expect(db.tables.sessions.find(r => r.title === 'New')).toMatchObject({ is_published: true, sort_order: 0, session_type: 'talk' })
  })
})

it('delete refusal text is unchanged', () => {
  expect(SESSION_HAS_CHECKINS_ERROR).toBe('This session has check-ins — unpublish it instead.')
  expect(typeof deleteSession).toBe('function')
})

describe('SessionForm Published control', () => {
  const props = { eventId: EV, timezone: 'America/New_York', tracks: [], rooms: [], speakers: [], onCancel: () => {} }
  const existing = {
    id: S1, event_id: EV, title: 'Old', description: null, session_type: 'panel',
    starts_at: '2026-10-01T14:00:00.000Z', ends_at: '2026-10-01T15:00:00.000Z',
    track_id: null, room_id: null, capacity: null, is_published: false, sort_order: 7,
  } as unknown as Session

  it('shows the current value and saves it; toggling republishes, toggling again unpublishes', async () => {
    const onSave = vi.fn(async () => {})
    render(<SessionForm {...props} session={existing} onSave={onSave} />)
    const box = screen.getByLabelText(/Published/) as HTMLInputElement
    expect(box.checked).toBe(false)
    await act(async () => { fireEvent.click(screen.getByText('Update')) })
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ is_published: false }))
    fireEvent.click(box)
    await act(async () => { fireEvent.click(screen.getByText('Update')) })
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ is_published: true }))
    fireEvent.click(box)
    await act(async () => { fireEvent.click(screen.getByText('Update')) })
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ is_published: false }))
  })

  it('a new session starts published', () => {
    render(<SessionForm {...props} onSave={vi.fn()} />)
    expect((screen.getByLabelText(/Published/) as HTMLInputElement).checked).toBe(true)
  })
})

describe('AgendaGrid', () => {
  const s = (id: string, title: string, is_published: boolean) => ({
    id, event_id: EV, title, session_type: 'talk', is_published,
    starts_at: '2026-10-01T14:00:00.000Z', ends_at: '2026-10-01T15:00:00.000Z',
  }) as unknown as Session

  it('marks unpublished sessions only', () => {
    render(<AgendaGrid sessions={[s('a', 'Live one', true), s('b', 'Draft one', false)]} tracks={[]} rooms={[]} onEdit={() => {}} onDelete={() => {}} />)
    expect(screen.getAllByText('Unpublished')).toHaveLength(1)
    expect(screen.getByText('Draft one').parentElement).toHaveTextContent('Unpublished')
    expect(screen.getByText('Live one').parentElement).not.toHaveTextContent('Unpublished')
  })
})

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth/get-user', () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', email: 'staff@test.com' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}))

import {
  getTracks, createTrack, updateTrack, deleteTrack,
  getRooms, createRoom,
  getSpeakers, createSpeaker,
  getSessions, createSession, updateSession, deleteSession,
} from '@/lib/agenda/actions'

const EVENT_ID   = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const ORG_ID     = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const TRACK_ID   = 'd1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const SESSION_ID = 'e1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const SPEAKER_ID = 'f1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'

const mockEvent  = { id: EVENT_ID, org_id: ORG_ID }
const mockMember = { role: 'staff' }

function makeChain(override: Record<string, any> = {}) {
  const base: Record<string, any> = {}
  for (const k of ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'order', 'limit', 'is', 'upsert']) {
    base[k] = vi.fn().mockReturnValue(base)
  }
  base.single = vi.fn()
  for (const k of Object.keys(override)) base[k] = override[k]
  return base
}

function withAuth(tableOverrides: Record<string, () => any>) {
  mockFromImpl = (t: string) => {
    if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
    if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
    return tableOverrides[t] ? tableOverrides[t]() : makeChain()
  }
}

// ─── TRACKS ───────────────────────────────────────────────────────────────────

describe('getTracks', () => {
  it('returns tracks ordered by sort_order', async () => {
    const data = [{ id: TRACK_ID, name: 'Main Stage', color: '#3B82F6', sort_order: 0 }]
    withAuth({ tracks: () => makeChain({ order: vi.fn().mockResolvedValue({ data, error: null }) }) })
    const result = await getTracks(EVENT_ID)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Main Stage')
  })
})

describe('createTrack', () => {
  it('validates required name', async () => {
    withAuth({})
    const result = await createTrack(EVENT_ID, { name: '', color: '#fff' })
    expect((result as any).error).toBeTruthy()
  })

  it('creates a track successfully', async () => {
    const newTrack = { id: TRACK_ID, name: 'Workshop', color: '#8B5CF6', sort_order: 1 }
    withAuth({ tracks: () => makeChain({ single: vi.fn().mockResolvedValue({ data: newTrack, error: null }) }) })
    const result = await createTrack(EVENT_ID, { name: 'Workshop', color: '#8B5CF6' })
    expect((result as any).data.name).toBe('Workshop')
  })
})

// ─── ROOMS ────────────────────────────────────────────────────────────────────

describe('createRoom', () => {
  it('creates a room with capacity', async () => {
    const newRoom = { id: 'r1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e', name: 'Hall A', capacity: 200 }
    withAuth({ rooms: () => makeChain({ single: vi.fn().mockResolvedValue({ data: newRoom, error: null }) }) })
    const result = await createRoom(EVENT_ID, { name: 'Hall A', capacity: 200 })
    expect((result as any).data.capacity).toBe(200)
  })
})

// ─── SPEAKERS ─────────────────────────────────────────────────────────────────

describe('createSpeaker', () => {
  it('validates required name', async () => {
    withAuth({})
    const result = await createSpeaker(EVENT_ID, { name: '' })
    expect((result as any).error).toBeTruthy()
  })

  it('rejects invalid email', async () => {
    withAuth({})
    const result = await createSpeaker(EVENT_ID, { name: 'Alice', email: 'not-an-email' })
    expect((result as any).error).toBeTruthy()
  })

  it('creates speaker with valid data', async () => {
    const newSpeaker = { id: SPEAKER_ID, name: 'Alice Smith', email: 'alice@conf.io', job_title: 'CTO' }
    withAuth({ speakers: () => makeChain({ single: vi.fn().mockResolvedValue({ data: newSpeaker, error: null }) }) })
    const result = await createSpeaker(EVENT_ID, { name: 'Alice Smith', email: 'alice@conf.io', job_title: 'CTO' })
    expect((result as any).data.name).toBe('Alice Smith')
  })
})

// ─── SESSIONS ─────────────────────────────────────────────────────────────────

describe('createSession', () => {
  it('validates required title', async () => {
    withAuth({})
    const result = await createSession(EVENT_ID, {
      title: '', session_type: 'talk',
      starts_at: '2025-06-01T09:00:00.000Z', ends_at: '2025-06-01T10:00:00.000Z',
    })
    expect((result as any).error).toBeTruthy()
  })

  it('validates session_type enum', async () => {
    withAuth({})
    const result = await createSession(EVENT_ID, {
      title: 'Good Talk', session_type: 'invalid_type',
      starts_at: '2025-06-01T09:00:00.000Z', ends_at: '2025-06-01T10:00:00.000Z',
    })
    expect((result as any).error).toBeTruthy()
  })

  it('creates session without speakers', async () => {
    const newSession = { id: SESSION_ID, title: 'Opening Keynote', session_type: 'keynote' }
    withAuth({ sessions: () => makeChain({ single: vi.fn().mockResolvedValue({ data: newSession, error: null }) }) })
    const result = await createSession(EVENT_ID, {
      title: 'Opening Keynote', session_type: 'keynote',
      starts_at: '2025-06-01T09:00:00.000Z', ends_at: '2025-06-01T10:00:00.000Z',
    })
    expect((result as any).data.title).toBe('Opening Keynote')
  })

  it('creates session with speakers and writes session_speakers', async () => {
    const newSession = { id: SESSION_ID, title: 'Panel', session_type: 'panel' }
    let sessionSpeakersInserted = false
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      if (t === 'sessions') return makeChain({ single: vi.fn().mockResolvedValue({ data: newSession, error: null }) })
      if (t === 'session_speakers') {
        const c = makeChain()
        c.insert = vi.fn().mockImplementation(() => { sessionSpeakersInserted = true; return Promise.resolve({ error: null }) })
        return c
      }
      return makeChain()
    }
    const result = await createSession(EVENT_ID, {
      title: 'Panel', session_type: 'panel',
      starts_at: '2025-06-01T14:00:00.000Z', ends_at: '2025-06-01T15:00:00.000Z',
      speaker_ids: [SPEAKER_ID],
    })
    expect((result as any).data.title).toBe('Panel')
    expect(sessionSpeakersInserted).toBe(true)
  })
})

describe('updateSession', () => {
  it('updates session and replaces speakers', async () => {
    const updated = { id: SESSION_ID, title: 'Updated Talk' }
    let speakersDeleted = false
    let speakersInserted = false
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      if (t === 'sessions') return makeChain({ single: vi.fn().mockResolvedValue({ data: updated, error: null }) })
      if (t === 'session_speakers') {
        const c = makeChain()
        c.delete = vi.fn().mockReturnValue({ eq: vi.fn().mockImplementation(() => { speakersDeleted = true; return Promise.resolve({ error: null }) }) })
        c.insert = vi.fn().mockImplementation(() => { speakersInserted = true; return Promise.resolve({ error: null }) })
        return c
      }
      return makeChain()
    }
    const result = await updateSession(EVENT_ID, SESSION_ID, { title: 'Updated Talk', speaker_ids: [SPEAKER_ID] })
    expect((result as any).data.title).toBe('Updated Talk')
    expect(speakersDeleted).toBe(true)
    expect(speakersInserted).toBe(true)
  })
})

describe('deleteSession', () => {
  it('deletes session', async () => {
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      if (t === 'sessions') {
        const c = makeChain()
        // chain: delete().eq('id').eq('event_id') — last eq resolves
        c.eq = vi.fn().mockReturnValueOnce(c).mockResolvedValueOnce({ error: null })
        return c
      }
      return makeChain()
    }
    const result = await deleteSession(EVENT_ID, SESSION_ID)
    expect((result as any).success).toBe(true)
  })
})

import { describe, it, expect, vi } from 'vitest'
import { makeFakeAdmin, type Recorded } from './fake-supabase'

vi.mock('@trigger.dev/sdk/v3', () => ({
  schedules: { task: (opts: any) => opts },
  tasks: { trigger: vi.fn() },
}))

import { findNoShowRegistrations } from '../no-show-sweep'

const EVENT_ID = 'event-1'

type Fixtures = {
  registrations: { id: string; event_id: string; status: string }[]
  syncState: { internal_registration_id: string; status: string; ghl_opportunity_id: string | null; dead_lettered: boolean }[]
  checkIns: { registration_id: string; session_id: string | null }[]
  attendance: { registration_id: string }[]
}

/**
 * Simulates real Postgres WHERE evaluation against the recorded filters,
 * rather than returning fixed fixture rows — the sync-state exclusion tests
 * below depend on the resolver actually honoring .eq('status', ...) /
 * .eq('dead_lettered', ...) the way the real DB would.
 */
function buildResolver(fx: Fixtures) {
  return (call: Recorded) => {
    if (call.table === 'registrations') {
      const eventId = call.filters.event_id?.eq
      const status = call.filters.status?.eq
      const rows = fx.registrations.filter((r) => r.event_id === eventId && r.status === status)
      return { data: rows.map((r) => ({ id: r.id })), error: null }
    }
    if (call.table === 'ghl_sync_state') {
      const ids: string[] = call.filters.internal_registration_id?.in ?? []
      const status = call.filters.status?.eq
      const deadLettered = call.filters.dead_lettered?.eq
      const rows = fx.syncState.filter(
        (r) => ids.includes(r.internal_registration_id) && r.status === status && r.dead_lettered === deadLettered,
      )
      return {
        data: rows.map((r) => ({
          internal_registration_id: r.internal_registration_id,
          ghl_opportunity_id: r.ghl_opportunity_id,
        })),
        error: null,
      }
    }
    if (call.table === 'check_ins') {
      const ids: string[] = call.filters.registration_id?.in ?? []
      return { data: fx.checkIns.filter((r) => ids.includes(r.registration_id)), error: null }
    }
    if (call.table === 'session_attendance') {
      const ids: string[] = call.filters.registration_id?.in ?? []
      return { data: fx.attendance.filter((r) => ids.includes(r.registration_id)), error: null }
    }
    throw new Error(`unexpected table: ${call.table}`)
  }
}

function baseFixtures(overrides: Partial<Fixtures> = {}): Fixtures {
  return {
    registrations: [{ id: 'r1', event_id: EVENT_ID, status: 'confirmed' }],
    syncState: [{ internal_registration_id: 'r1', status: 'synced', ghl_opportunity_id: 'opp1', dead_lettered: false }],
    checkIns: [],
    attendance: [],
    ...overrides,
  }
}

describe('findNoShowRegistrations', () => {
  it('returns a confirmed + synced (opp present, not dead-lettered) reg with zero check-ins and zero session attendance', async () => {
    const { admin } = makeFakeAdmin(buildResolver(baseFixtures()))
    const result = await findNoShowRegistrations(admin as any, EVENT_ID)
    expect(result).toEqual(['r1'])
  })

  it('does not return a reg that has any check_ins row (event-level, session_id null)', async () => {
    const fx = baseFixtures({ checkIns: [{ registration_id: 'r1', session_id: null }] })
    const { admin } = makeFakeAdmin(buildResolver(fx))
    const result = await findNoShowRegistrations(admin as any, EVENT_ID)
    expect(result).toEqual([])
  })

  it('does not return a reg that has any check_ins row (session-level)', async () => {
    const fx = baseFixtures({ checkIns: [{ registration_id: 'r1', session_id: 'sess-1' }] })
    const { admin } = makeFakeAdmin(buildResolver(fx))
    const result = await findNoShowRegistrations(admin as any, EVENT_ID)
    expect(result).toEqual([])
  })

  it('does not return a reg that has any session_attendance row', async () => {
    const fx = baseFixtures({ attendance: [{ registration_id: 'r1' }] })
    const { admin } = makeFakeAdmin(buildResolver(fx))
    const result = await findNoShowRegistrations(admin as any, EVENT_ID)
    expect(result).toEqual([])
  })

  it('does not return a non-confirmed reg', async () => {
    const fx = baseFixtures({ registrations: [{ id: 'r1', event_id: EVENT_ID, status: 'waitlisted' }] })
    const { admin } = makeFakeAdmin(buildResolver(fx))
    const result = await findNoShowRegistrations(admin as any, EVENT_ID)
    expect(result).toEqual([])
  })

  it('does not return a confirmed reg whose sync row is missing / not synced / has no opp / is dead-lettered', async () => {
    const fx = baseFixtures({
      registrations: [
        { id: 'r-good', event_id: EVENT_ID, status: 'confirmed' },
        { id: 'r-missing', event_id: EVENT_ID, status: 'confirmed' },
        { id: 'r-failed', event_id: EVENT_ID, status: 'confirmed' },
        { id: 'r-noopp', event_id: EVENT_ID, status: 'confirmed' },
        { id: 'r-dead', event_id: EVENT_ID, status: 'confirmed' },
      ],
      syncState: [
        { internal_registration_id: 'r-good', status: 'synced', ghl_opportunity_id: 'opp1', dead_lettered: false },
        // r-missing: no ghl_sync_state row at all
        { internal_registration_id: 'r-failed', status: 'failed', ghl_opportunity_id: 'opp2', dead_lettered: false },
        { internal_registration_id: 'r-noopp', status: 'synced', ghl_opportunity_id: null, dead_lettered: false },
        { internal_registration_id: 'r-dead', status: 'synced', ghl_opportunity_id: 'opp3', dead_lettered: true },
      ],
    })
    const { admin } = makeFakeAdmin(buildResolver(fx))
    const result = await findNoShowRegistrations(admin as any, EVENT_ID)
    expect(result).toEqual(['r-good'])
  })
})

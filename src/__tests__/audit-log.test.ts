import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// REFACTOR SAFETY ONLY — THIS FILE IS NOT EVIDENCE THE AUDIT TRAIL WORKS.
//
// The admin client is faked. A fake has no column types, no RLS, no grants and
// no FKs, so a mocked insert succeeds whether or not the real table would
// accept the row. What these tests DO protect: the write goes through the
// service-role client no matter what the caller hands in (O120 — the user-
// scoped client was refused by RLS at ~30 sites), event_id is set and org_id
// is resolved from the event, a non-uuid entityId cannot fail the insert, and
// neither a returned nor a thrown error reaches the caller.
//
// The real proof is a live action on prezva.app followed by a row count.
// ─────────────────────────────────────────────────────────────────────────────

const ORG = '11111111-1111-4111-8111-111111111111'
const OTHER_ORG = '22222222-2222-4222-8222-222222222222'
const EVENT = '33333333-3333-4333-8333-333333333333'
const REC = '44444444-4444-4444-8444-444444444444'
const USER = '55555555-5555-4555-8555-555555555555'

type InsertResult = { error: { message: string } | null } | Error
type EventResult = { data: { org_id: string | null } | null; error: { message: string } | null }

const state: {
  insertResult: InsertResult
  eventResult: EventResult
  insert: ReturnType<typeof vi.fn>
  eventEq: ReturnType<typeof vi.fn>
  from: ReturnType<typeof vi.fn>
} = {} as never

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: state.from })),
}))

import { logAudit } from '@/lib/audit/log'
import { createAdminClient } from '@/lib/supabase/admin'

let errSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  state.insertResult = { error: null }
  state.eventResult = { data: { org_id: ORG }, error: null }
  state.insert = vi.fn(() =>
    state.insertResult instanceof Error ? Promise.reject(state.insertResult) : Promise.resolve(state.insertResult),
  )
  state.eventEq = vi.fn(() => ({ maybeSingle: () => Promise.resolve(state.eventResult) }))
  state.from = vi.fn((table: string) =>
    table === 'events'
      ? { select: () => ({ eq: state.eventEq }) }
      : { insert: state.insert },
  )
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  errSpy.mockRestore()
})

// A caller's user-scoped client. If logAudit touched it, these would record.
function userClient() {
  return { from: vi.fn(() => { throw new Error('user-scoped client must not be used') }) }
}

describe('logAudit', () => {
  it('writes through the service-role client, never the client it was handed', async () => {
    const passed = userClient()

    await logAudit(passed, ORG, USER, 'org.update', 'organizations', ORG)

    expect(createAdminClient).toHaveBeenCalled()
    expect(passed.from).not.toHaveBeenCalled()
    expect(state.from).toHaveBeenCalledWith('audit_logs')
    expect(state.insert).toHaveBeenCalledWith({
      org_id: ORG,
      event_id: null,
      user_id: USER,
      action: 'org.update',
      table_name: 'organizations',
      record_id: ORG,
      new_data: null,
    })
  })

  it('sets event_id and resolves org_id from the event when the caller passes null', async () => {
    await logAudit(userClient(), null, USER, 'checkin.scan', 'registrations', REC, { method: 'qr_scan' }, { eventId: EVENT })

    expect(state.from).toHaveBeenCalledWith('events')
    expect(state.eventEq).toHaveBeenCalledWith('id', EVENT)
    expect(state.insert).toHaveBeenCalledWith({
      org_id: ORG,
      event_id: EVENT,
      user_id: USER,
      action: 'checkin.scan',
      table_name: 'registrations',
      record_id: REC,
      new_data: { method: 'qr_scan' },
    })
  })

  it('uses the event org over a different orgId from the caller, and says so', async () => {
    await logAudit(userClient(), OTHER_ORG, USER, 'ticket.create', 'ticket_types', REC, undefined, { eventId: EVENT })

    expect(state.insert.mock.calls[0][0]).toMatchObject({ org_id: ORG, event_id: EVENT })
    expect(errSpy).toHaveBeenCalledTimes(1)
    expect(String(errSpy.mock.calls[0][0])).toContain('does not match')
  })

  it('still writes the row when the event lookup finds nothing, keeping the id in new_data', async () => {
    state.eventResult = { data: null, error: null }

    await logAudit(userClient(), ORG, USER, 'session.delete', 'session', REC, undefined, { eventId: EVENT })

    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: ORG,
      event_id: null,
      new_data: { event_ref: EVENT },
    }))
    expect(String(errSpy.mock.calls[0][0])).toContain('event lookup failed')
  })

  it('puts a non-uuid entityId in new_data.entity_ref with record_id null, and the insert still runs', async () => {
    await logAudit(userClient(), ORG, USER, 'track.update', 'track', 'not-a-uuid', { name: 'Main' })

    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({
      record_id: null,
      new_data: { name: 'Main', entity_ref: 'not-a-uuid' },
    }))
    expect(errSpy).not.toHaveBeenCalled()
  })

  it('maps omitted optionals to null rather than undefined', async () => {
    await logAudit(userClient(), null, null, 'org.create')

    expect(state.insert).toHaveBeenCalledWith({
      org_id: null,
      event_id: null,
      user_id: null,
      action: 'org.create',
      table_name: null,
      record_id: null,
      new_data: null,
    })
  })

  it('says nothing when the insert succeeds', async () => {
    await logAudit(userClient(), ORG, null, 'org.update')

    expect(errSpy).not.toHaveBeenCalled()
  })

  it('LOGS a returned { error } with the action instead of discarding it, and does not throw', async () => {
    // postgrest-js resolves with { error } rather than throwing.
    state.insertResult = { error: { message: 'new row violates row-level security policy' } }

    await expect(logAudit(userClient(), ORG, null, 'certificate.bulk_issue')).resolves.toBeUndefined()

    expect(errSpy).toHaveBeenCalledTimes(1)
    const [prefix, message, ctx] = errSpy.mock.calls[0]
    // 'insert failed', specifically — a PostgREST rejection, not a transport
    // failure. The two mean different things to whoever reads the log.
    expect(prefix).toContain('insert failed')
    expect(prefix).not.toContain('threw')
    expect(message).toContain('row-level security')
    expect(ctx).toEqual({ action: 'certificate.bulk_issue' })
  })

  it('still catches a THROWN error, and logs it distinctly', async () => {
    state.insertResult = new Error('fetch failed')

    await expect(logAudit(userClient(), ORG, null, 'ticket.create')).resolves.toBeUndefined()

    expect(errSpy).toHaveBeenCalledTimes(1)
    const [prefix, message] = errSpy.mock.calls[0]
    expect(prefix).toContain('threw')
    expect(message).toContain('fetch failed')
  })

  it('does not throw when the admin client cannot be constructed', async () => {
    vi.mocked(createAdminClient).mockImplementationOnce(() => { throw new Error('Missing Supabase admin credentials') })

    await expect(logAudit(userClient(), ORG, null, 'ticket.create')).resolves.toBeUndefined()

    expect(String(errSpy.mock.calls[0][1])).toContain('Missing Supabase admin credentials')
  })
})

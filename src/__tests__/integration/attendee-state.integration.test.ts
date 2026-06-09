/**
 * Integration: resolveAttendeeState — verifies that a confirmed registration is
 * recognised as 'registered' and transitions to 'checked_in' when a check_ins row exists.
 * Guards the attendee home against showing the public "Get Tickets" page to registered attendees.
 *
 * Fixture (live DB): event 'augusta-chamber-mixer-2026', reg 08000003-0001-4001-8001-000000000001
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from './setup'
import { resolveAttendeeState } from '@/lib/attendees/resolve-state'

const EVENT_SLUG = 'augusta-chamber-mixer-2026'
const REG_ID = '08000003-0001-4001-8001-000000000001'

let eventId: string
let insertedCheckInId: string | null = null

beforeAll(async () => {
  const { data: ev, error } = await db
    .from('events')
    .select('id')
    .eq('slug', EVENT_SLUG)
    .single()
  if (error || !ev) throw new Error(`Fixture event '${EVENT_SLUG}' not found in DB`)
  eventId = ev.id
})

afterAll(async () => {
  if (insertedCheckInId) {
    await db.from('check_ins').delete().eq('id', insertedCheckInId)
    insertedCheckInId = null
  }
})

describe('resolveAttendeeState', () => {
  it('returns state=registered for a confirmed registration with no check_in', async () => {
    // Ensure no leftover check_in for this reg (defensive)
    await db.from('check_ins').delete().eq('registration_id', REG_ID).is('session_id', null)

    const result = await resolveAttendeeState(eventId, REG_ID, db as any)

    expect(result.state).toBe('registered')
    expect(result.reg).not.toBeNull()
    expect(result.reg!.id).toBe(REG_ID)
    expect(result.checkedInAt).toBeNull()
  })

  it('returns state=public for an unknown regId', async () => {
    const result = await resolveAttendeeState(eventId, '00000000-0000-0000-0000-000000000000', db as any)
    expect(result.state).toBe('public')
    expect(result.reg).toBeNull()
  })

  it('returns state=public when regId is null', async () => {
    const result = await resolveAttendeeState(eventId, null, db as any)
    expect(result.state).toBe('public')
    expect(result.reg).toBeNull()
  })

  it('returns state=checked_in after an event-level check_ins row is inserted', async () => {
    // Insert an event-level check_in (session_id NULL)
    const { data: ci, error: insertErr } = await db
      .from('check_ins')
      .insert({
        event_id: eventId,
        registration_id: REG_ID,
        session_id: null,
        method: 'self',
        device_id: 'inttest',
        synced_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    expect(insertErr).toBeNull()
    insertedCheckInId = ci!.id

    const result = await resolveAttendeeState(eventId, REG_ID, db as any)

    expect(result.state).toBe('checked_in')
    expect(result.reg).not.toBeNull()
    expect(result.checkedInAt).not.toBeNull()
  })
})

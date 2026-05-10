/**
 * Integration: registrations + ticket_types schema
 * Sprint 1 bug: code filtered .eq('ticket_type', 'free') but the column is type, not ticket_type.
 * These tests would have failed before Sprint 1 was applied.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { db, DEMO, INTTEST_EMAIL_SUFFIX, cleanupIntTestData } from './setup'

afterAll(cleanupIntTestData)

describe('attendees — schema integration', () => {
  it('ticket_types has a type column (not ticket_type)', async () => {
    const { data, error } = await db
      .from('ticket_types')
      .select('id, name, type')
      .eq('event_id', DEMO.eventId)

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect(data!.length).toBeGreaterThan(0)
    // Verify the column is named 'type', not 'ticket_type'
    expect(data![0]).toHaveProperty('type')
    expect(data![0]).not.toHaveProperty('ticket_type')
  })

  it('filters ticket_types by type=free without error', async () => {
    const { data, error } = await db
      .from('ticket_types')
      .select('id, name, type')
      .eq('event_id', DEMO.eventId)
      .eq('type', 'free')

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect(data!.every((tt: { type: string }) => tt.type === 'free')).toBe(true)
  })

  it('getAttendees query — registrations with ticket_types join', async () => {
    const { data, error } = await db
      .from('registrations')
      .select('*, ticket_types!inner(name, price_cents), check_ins(checked_in_at)', { count: 'exact' })
      .eq('event_id', DEMO.eventId)
      .limit(5)

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('manually adds a registration and reads it back', async () => {
    const email = `inttest-attendee-${Date.now()}${INTTEST_EMAIL_SUFFIX}`

    const { data, error } = await db.from('registrations').insert({
      event_id:        DEMO.eventId,
      ticket_type_id:  DEMO.ticketFreeId,
      attendee_name:   'Integration Test Attendee',
      attendee_email:  email,
      status:          'confirmed',
      amount_paid_cents: 0,
    }).select().single()

    expect(error).toBeNull()
    expect(data!.attendee_email).toBe(email)
    // cleanup handled by afterAll
  })
})

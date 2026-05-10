/**
 * Integration: survey_responses schema
 * Sprint 1 bug: analytics query did .eq('event_id', eventId) on survey_responses directly
 *   but survey_responses has no event_id column — must join through surveys.
 * These tests would have failed before Sprint 1 was applied.
 */
import { describe, it, expect } from 'vitest'
import { db, DEMO } from './setup'

describe('analytics — schema integration', () => {
  it('survey_responses joined through surveys by event_id', async () => {
    const { data, error } = await db
      .from('survey_responses')
      .select('id, surveys!inner(event_id)')
      .eq('surveys.event_id', DEMO.eventId)

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('selecting event_id directly from survey_responses fails (negative test)', async () => {
    // Documents the pre-Sprint-1 bug: direct event_id filter would cause 42703
    const { error } = await db
      .from('survey_responses')
      .select('event_id')
      .limit(1)

    expect(error).not.toBeNull()
    expect(error!.code).toBe('42703')
  })

  it('full getEventAnalytics query set — all parallel fetches succeed', async () => {
    const [
      { error: e1 },
      { error: e2 },
      { error: e3 },
      { error: e4 },
      { error: e5 },
      { error: e6 },
    ] = await Promise.all([
      db.from('events').select('capacity, registration_count, checked_in_count').eq('id', DEMO.eventId).single(),
      db.from('registrations').select('status, amount_paid_cents, ticket_type_id, created_at').eq('event_id', DEMO.eventId),
      db.from('check_ins').select('id').eq('event_id', DEMO.eventId),
      db.from('survey_responses').select('id, surveys!inner(event_id)').eq('surveys.event_id', DEMO.eventId),
      db.from('announcements').select('id').eq('event_id', DEMO.eventId),
      db.from('ticket_types').select('id, name, type').eq('event_id', DEMO.eventId),
    ])

    expect(e1).toBeNull()
    expect(e2).toBeNull()
    expect(e3).toBeNull()
    expect(e4).toBeNull()
    expect(e5).toBeNull()
    expect(e6).toBeNull()
  })
})

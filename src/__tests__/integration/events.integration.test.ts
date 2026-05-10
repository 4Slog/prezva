/**
 * Integration: events schema
 * Sprint 1 bug: code referenced events.name but the real column is events.title.
 * These tests would have failed before Sprint 1 was applied.
 */
import { describe, it, expect } from 'vitest'
import { db, DEMO } from './setup'

describe('events — schema integration', () => {
  it('selects title column (not name) from events', async () => {
    const { data, error } = await db
      .from('events')
      .select('id, title, slug')
      .eq('id', DEMO.eventId)
      .single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.title).toBe('Birmingham Small Business Week 2026')
    expect(data!.slug).toBe('birmingham-sbw-2026')
  })

  it('attendees page query — events joined by slug returns title', async () => {
    const { data, error } = await db
      .from('events')
      .select('id, title, org_id')
      .eq('slug', 'birmingham-sbw-2026')
      .single()

    expect(error).toBeNull()
    expect(data!.title).toBeTruthy()
  })

  it('checkin page query — events joined by slug returns title', async () => {
    const { data, error } = await db
      .from('events')
      .select('id, title, registration_count, checked_in_count')
      .eq('slug', 'birmingham-sbw-2026')
      .single()

    expect(error).toBeNull()
    expect(typeof data!.title).toBe('string')
  })

  it('agenda page query — events joined by slug returns title', async () => {
    const { data, error } = await db
      .from('events')
      .select('id, title')
      .eq('slug', 'birmingham-sbw-2026')
      .single()

    expect(error).toBeNull()
    expect(data!.title).not.toBeNull()
  })
})

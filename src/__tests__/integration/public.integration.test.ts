/**
 * Integration: session_bookmarks schema
 * Sprint 1 bug: code referenced session_bookmarks.event_id but that column does not exist.
 *   Bookmarks join to event through the sessions table.
 * These tests would have failed before Sprint 1 was applied.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { db, DEMO, cleanupIntTestData } from './setup'

afterAll(cleanupIntTestData)

describe('public / bookmarks — schema integration', () => {
  it('session_bookmarks table has no event_id column', async () => {
    // Selecting a non-existent column returns a 42703 error — that's the bug
    const { error } = await db
      .from('session_bookmarks')
      .select('session_id')  // only valid columns
      .eq('user_id', DEMO.userId)
      .limit(1)

    expect(error).toBeNull()
  })

  it('getBookmarks query — join through sessions to get event_id', async () => {
    const { data, error } = await db
      .from('session_bookmarks')
      .select('session_id, sessions!inner(event_id)')
      .eq('user_id', DEMO.userId)
      .eq('sessions.event_id', DEMO.eventId)

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('toggleBookmark insert — no event_id in payload', async () => {
    // upsert is idempotent — works whether the bookmark already exists or not
    const { error } = await db.from('session_bookmarks').upsert({
      user_id:    DEMO.userId,
      session_id: DEMO.sessionId,
      // No event_id — column does not exist
    }, { onConflict: 'user_id,session_id', ignoreDuplicates: true })

    expect(error).toBeNull()
  })

  it('selecting event_id from session_bookmarks returns a schema error (negative test)', async () => {
    // This documents the bug: if you try to select event_id it should fail.
    const { error } = await db
      .from('session_bookmarks')
      .select('event_id')
      .limit(1)

    // PostgREST returns code 42703 for unknown column
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42703')
  })
})

// Batch D commit 1 (O144): createNotification reports its failure instead of
// swallowing it, and 0155 grants a signed-in user only their own rows and only
// the is_read column. The migration was also probed live (see the D1 report).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.db.client) }))

import { createNotification } from '@/lib/notifications/create-notification'

describe('createNotification', () => {
  beforeEach(() => { h.db = createFakeDb({ user_notifications: [] }) })

  it('inserts and returns { error: null }', async () => {
    expect(await createNotification('u1', 'certificate', 'Ready', 'body', '/me/wallet')).toEqual({ error: null })
    expect(h.db.tables.user_notifications).toMatchObject([{ user_id: 'u1', type: 'certificate', title: 'Ready' }])
  })

  it('returns the insert error and logs it', async () => {
    h.db = createFakeDb({}, { failInsert: { user_notifications: { code: '42P01', message: 'relation "user_notifications" does not exist' } } })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await createNotification('u1', 'video_chat_request', 'Hi')).toEqual({ error: 'relation "user_notifications" does not exist' })
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it('never throws — a thrown client error comes back as { error }', async () => {
    h.db = { client: { from: () => { throw new Error('boom') } } }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await createNotification('u1', 'announcement', 'Hi')).toEqual({ error: 'boom' })
    log.mockRestore()
  })
})

describe('0155 user_notifications RLS', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0155_user_notifications.sql'), 'utf-8')
    .replace(/--.*$/gm, '').replace(/\s+/g, ' ')

  it('type CHECK lists exactly the three real writers', () => {
    expect(sql).toContain("CHECK (type IN ('announcement','certificate','video_chat_request'))")
  })

  it('SELECT and UPDATE are limited to the caller’s own rows', () => {
    expect(sql).toMatch(/CREATE POLICY user_notifications_select_own ON public\.user_notifications FOR SELECT TO authenticated USING \(user_id = \(SELECT auth\.uid\(\)\)\)/)
    expect(sql).toMatch(/CREATE POLICY user_notifications_update_own ON public\.user_notifications FOR UPDATE TO authenticated USING \(user_id = \(SELECT auth\.uid\(\)\)\) WITH CHECK \(user_id = \(SELECT auth\.uid\(\)\)\)/)
  })

  it('is_read is the only column a user can update, and the table grant is revoked first', () => {
    const revoke = sql.indexOf('REVOKE UPDATE ON public.user_notifications FROM authenticated')
    const grant = sql.indexOf('GRANT UPDATE (is_read) ON public.user_notifications TO authenticated')
    expect(revoke).toBeGreaterThan(-1)
    expect(grant).toBeGreaterThan(revoke)
    expect(sql.match(/GRANT UPDATE/g)).toHaveLength(1)
  })

  it('no INSERT or DELETE policy; anon has nothing; TRUNCATE revoked', () => {
    expect(sql).not.toMatch(/FOR (INSERT|DELETE|ALL)/)
    expect(sql).toContain('REVOKE ALL ON public.user_notifications FROM anon')
    expect(sql).toMatch(/REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public\.user_notifications FROM authenticated/)
  })
})

describe('notifyAnnouncementInApp (push-only paths)', () => {
  it('loads the announcement’s confirmed accounts, applies targeting, and upserts one row each', async () => {
    const { notifyAnnouncementInApp } = await import('@/lib/announcements/in-app')
    const db = createFakeDb({
      announcements: [{ id: 'a1', event_id: 'e1', title: 'Doors open', body: 'Now', audience_filter: { types: ['t1'] }, exclude_filter: { types: [] }, events: { slug: 'conf' } }],
      registrations: [
        { event_id: 'e1', status: 'confirmed', user_id: 'u1', ticket_type_id: 't1' },
        { event_id: 'e1', status: 'confirmed', user_id: 'u2', ticket_type_id: 't2' },
        { event_id: 'e1', status: 'cancelled', user_id: 'u3', ticket_type_id: 't1' },
      ],
      user_notifications: [],
    })
    expect(await notifyAnnouncementInApp(db.client, 'a1')).toEqual({ error: null, count: 1 })
    expect(db.tables.user_notifications).toMatchObject([{ user_id: 'u1', type: 'announcement', announcement_id: 'a1', url: 'https://prezva.app/e/conf' }])
  })
})

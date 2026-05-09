import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const RLS_PATH = join(process.cwd(), 'supabase/migrations/0002_rls.sql')

const ALL_TABLES = [
  'profiles', 'organizations', 'org_members', 'events', 'ticket_types',
  'discount_codes', 'registrations', 'check_ins', 'offline_queue', 'speakers',
  'tracks', 'rooms', 'sessions', 'session_speakers', 'session_bookmarks',
  'announcements', 'conversations', 'messages', 'surveys', 'survey_questions',
  'survey_responses', 'survey_answers', 'audit_logs',
]

describe('RLS migration', () => {
  let sql: string

  beforeEach(() => {
    sql = readFileSync(RLS_PATH, 'utf-8')
  })

  it('migration file exists and is non-empty', () => {
    expect(sql.length).toBeGreaterThan(500)
  })

  it.each(ALL_TABLES)('RLS is enabled on table %s', (table) => {
    expect(sql).toContain('alter table public.' + table + ' enable row level security')
  })

  it('all 23 tables have RLS enabled', () => {
    const count = (sql.match(/enable row level security/g) || []).length
    expect(count).toBe(23)
  })

  it('has at least 70 policies defined', () => {
    const count = (sql.match(/create policy/g) || []).length
    expect(count).toBeGreaterThanOrEqual(70)
  })

  it('helper function is_org_member is defined', () => {
    expect(sql).toContain('function public.is_org_member')
  })

  it('helper function has_org_role is defined', () => {
    expect(sql).toContain('function public.has_org_role')
  })

  it('helper function is_registered is defined', () => {
    expect(sql).toContain('function public.is_registered')
  })

  it('helper function event_org_id is defined', () => {
    expect(sql).toContain('function public.event_org_id')
  })

  it('audit_logs has no insert policy (service role only)', () => {
    expect(sql).not.toContain('audit_logs for insert')
  })

  it('check_ins has no update or delete policy (immutable)', () => {
    expect(sql).not.toContain('check_ins for update')
    expect(sql).not.toContain('check_ins for delete')
  })

  it('session_bookmarks policies are user-scoped', () => {
    expect(sql).toContain('session_bookmarks_select')
    expect(sql).toContain('session_bookmarks_insert')
    expect(sql).toContain('session_bookmarks_delete')
  })
})

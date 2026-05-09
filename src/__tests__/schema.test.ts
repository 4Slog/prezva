import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const MIGRATION_PATH = join(process.cwd(), 'supabase/migrations/0001_initial_schema.sql')

const EXPECTED_TABLES = [
  'profiles', 'organizations', 'org_members', 'events', 'ticket_types',
  'discount_codes', 'registrations', 'check_ins', 'offline_queue', 'speakers',
  'tracks', 'rooms', 'sessions', 'session_speakers', 'session_bookmarks',
  'announcements', 'conversations', 'messages', 'surveys', 'survey_questions',
  'survey_responses', 'survey_answers', 'audit_logs',
]

describe('Schema migration', () => {
  let sql: string

  beforeEach(() => {
    sql = readFileSync(MIGRATION_PATH, 'utf-8')
  })

  it('migration file exists and is non-empty', () => {
    expect(sql.length).toBeGreaterThan(100)
  })

  it.each(EXPECTED_TABLES)('table %s is defined in migration', (table) => {
    expect(sql).toContain('create table public.' + table)
  })

  it('updated_at trigger function is defined', () => {
    expect(sql).toContain('handle_updated_at')
  })

  it('new user trigger is defined', () => {
    expect(sql).toContain('handle_new_user')
  })

  it('capacity enforcement trigger is defined', () => {
    expect(sql).toContain('enforce_ticket_capacity')
  })

  it('registration count trigger is defined', () => {
    expect(sql).toContain('update_registration_count')
  })
})

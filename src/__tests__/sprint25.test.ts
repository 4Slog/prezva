import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const SRC = join(process.cwd(), 'src')
const MIGS = join(process.cwd(), 'supabase/migrations')

describe('Sprint 25 — Sponsor Module', () => {
  // T-400: Migration
  it('migration 0025 creates event_sponsors table', () => {
    const path = join(MIGS, '0025_sprint25_sponsors.sql')
    expect(existsSync(path)).toBe(true)
    const sql = readFileSync(path, 'utf-8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS event_sponsors')
    expect(sql).toContain("CHECK (tier IN ('title','gold','silver','bronze'))")
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
  })

  it('migration 0025 creates attendee_points with unique constraint', () => {
    const sql = readFileSync(join(MIGS, '0025_sprint25_sponsors.sql'), 'utf-8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS attendee_points')
    expect(sql).toContain('UNIQUE (user_id, event_id)')
  })

  it('migration 0025 creates community_photos with votes', () => {
    const sql = readFileSync(join(MIGS, '0025_sprint25_sponsors.sql'), 'utf-8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS community_photos')
    expect(sql).toContain('votes int')
  })

  it('migration 0025 adds prompt column to icebreaker_questions', () => {
    const sql = readFileSync(join(MIGS, '0025_sprint25_sponsors.sql'), 'utf-8')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS prompt text')
    expect(sql).toContain('SET prompt = question WHERE prompt IS NULL')
  })

  it('migration 0025 has RLS policies for event_sponsors anon read + org admin write', () => {
    const sql = readFileSync(join(MIGS, '0025_sprint25_sponsors.sql'), 'utf-8')
    expect(sql).toContain('event_sponsors_read_published')
    expect(sql).toContain('event_sponsors_org_member_all')
  })

  // T-401: Sponsor management UI
  it('sponsor actions file exists with CRUD functions', () => {
    const path = join(SRC, 'lib/sponsors/actions.ts')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain("'use server'")
    expect(src).toContain('getSponsors')
    expect(src).toContain('createSponsor')
    expect(src).toContain('updateSponsor')
    expect(src).toContain('deleteSponsor')
  })

  it('sponsor actions validate tier enum', () => {
    const src = readFileSync(join(SRC, 'lib/sponsors/actions.ts'), 'utf-8')
    expect(src).toContain("z.enum(['title', 'gold', 'silver', 'bronze'])")
  })

  it('sponsors page replaced with real UI', () => {
    const path = join(SRC, 'app/(dashboard)/events/[slug]/sponsors/page.tsx')
    const src = readFileSync(path, 'utf-8')
    expect(src).not.toContain('Full sponsor management UI — Sprint 25')
    expect(src).toContain('SponsorsClient')
    expect(src).toContain('getSponsors')
  })

  it('sponsors client has tier-grouped list + add/edit/delete', () => {
    const path = join(SRC, 'app/(dashboard)/events/[slug]/sponsors/sponsors-client.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain("'use client'")
    expect(src).toContain('createSponsor')
    expect(src).toContain('updateSponsor')
    expect(src).toContain('deleteSponsor')
    expect(src).toContain('title')
    expect(src).toContain('gold')
    expect(src).toContain('silver')
    expect(src).toContain('bronze')
  })

  // T-402: Seed data
  it('seed migration 0026 exists with trivia, passport, and sponsor data', () => {
    const path = join(MIGS, '0026_sprint25_seed.sql')
    expect(existsSync(path)).toBe(true)
    const sql = readFileSync(path, 'utf-8')
    expect(sql).toContain('trivia_questions')
    expect(sql).toContain('passport_locations')
    expect(sql).toContain('event_sponsors')
    expect(sql).toContain('birmingham-sbw-2026')
  })

  it('seed migration uses safe DO block with event existence check', () => {
    const sql = readFileSync(join(MIGS, '0026_sprint25_seed.sql'), 'utf-8')
    expect(sql).toContain('DO $$')
    expect(sql).toContain('IF v_event_id IS NULL THEN')
    expect(sql).toContain('ON CONFLICT DO NOTHING')
  })

  // T-403: Public sponsors section
  it('getPublicSponsors is exported from public actions', () => {
    const path = join(SRC, 'lib/public/actions.ts')
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('getPublicSponsors')
    expect(src).toContain('event_sponsors')
  })

  it('public event page imports and renders sponsors section', () => {
    const path = join(SRC, 'app/e/[slug]/page.tsx')
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('getPublicSponsors')
    expect(src).toContain('sponsors')
    expect(src).toContain('id="sponsors"')
    expect(src).toContain("s.tier === tier")
  })
})

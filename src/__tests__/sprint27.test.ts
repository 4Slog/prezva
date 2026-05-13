import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const SRC = join(process.cwd(), 'src')
const SUPABASE = join(process.cwd(), 'supabase/migrations')

describe('Sprint 27 — Hardening + Bug Fixes + Volunteer Module', () => {

  // ── Migration ──────────────────────────────────────────────────────────────

  it('migration 0028 exists', () => {
    expect(existsSync(join(SUPABASE, '0028_sprint27_hardening.sql'))).toBe(true)
  })

  it('migration 0028 creates volunteers table', () => {
    const sql = readFileSync(join(SUPABASE, '0028_sprint27_hardening.sql'), 'utf-8')
    expect(sql).toContain('create table public.volunteers')
    expect(sql).toContain('portal_access_token')
    expect(sql).toContain('get_volunteer_by_token')
  })

  it('migration 0028 has duplicate registration guard', () => {
    const sql = readFileSync(join(SUPABASE, '0028_sprint27_hardening.sql'), 'utf-8')
    expect(sql).toContain('registrations_no_duplicate_idx')
  })

  it('migration 0028 has org_members performance index', () => {
    const sql = readFileSync(join(SUPABASE, '0028_sprint27_hardening.sql'), 'utf-8')
    expect(sql).toContain('org_members_role_idx')
  })

  it('migration 0028 creates dead_letter_items table', () => {
    const sql = readFileSync(join(SUPABASE, '0028_sprint27_hardening.sql'), 'utf-8')
    expect(sql).toContain('create table public.dead_letter_items')
  })

  // ── Sidebar fix ─────────────────────────────────────────────────────────────

  it('Sidebar.tsx has dynamic org slug injection', () => {
    const src = readFileSync(join(SRC, 'components/layout/Sidebar.tsx'), 'utf-8')
    expect(src).toContain('currentOrgSlug')
    expect(src).toContain('orgs/${currentOrgSlug}')
    expect(src).toContain('Integrations')
    expect(src).toContain('collapsed')
  })

  it('dashboard layout uses Sidebar component', () => {
    const src = readFileSync(join(SRC, 'app/(dashboard)/layout.tsx'), 'utf-8')
    expect(src).toContain('Sidebar')
    expect(src).toContain('defaultOrgSlug')
  })

  // ── Public routes ──────────────────────────────────────────────────────────

  it('public sponsors page exists', () => {
    expect(existsSync(join(SRC, 'app/e/[slug]/sponsors/page.tsx'))).toBe(true)
  })

  it('public checkin redirect route exists', () => {
    expect(existsSync(join(SRC, 'app/e/[slug]/checkin/route.ts'))).toBe(true)
    const src = readFileSync(join(SRC, 'app/e/[slug]/checkin/route.ts'), 'utf-8')
    expect(src).toContain('redirect')
    expect(src).toContain('/events/${')
  })

  // ── Volunteer module ───────────────────────────────────────────────────────

  it('volunteer admin page exists', () => {
    expect(existsSync(join(SRC, 'app/(dashboard)/events/[slug]/volunteers/page.tsx'))).toBe(true)
  })

  it('volunteer admin tile registered', () => {
    const src = readFileSync(join(SRC, 'lib/events/admin-tiles.ts'), 'utf-8')
    expect(src).toContain("key: 'volunteers'")
    expect(src).toContain('/volunteers')
  })

  it('volunteer invite trigger job exists', () => {
    expect(existsSync(join(SRC, 'trigger/jobs/volunteer-invite.ts'))).toBe(true)
    const src = readFileSync(join(SRC, 'trigger/jobs/volunteer-invite.ts'), 'utf-8')
    expect(src).toContain('send-volunteer-invite')
    expect(src).toContain('portalUrl')
  })

  it('volunteer portal page exists', () => {
    expect(existsSync(join(SRC, 'app/volunteer/[token]/page.tsx'))).toBe(true)
    const src = readFileSync(join(SRC, 'app/volunteer/[token]/page.tsx'), 'utf-8')
    expect(src).toContain('get_volunteer_by_token')
  })

  it('volunteer clock-in API route exists', () => {
    expect(existsSync(join(SRC, 'app/api/volunteer/[token]/clock-in/route.ts'))).toBe(true)
  })

  it('volunteer clock-out API route exists', () => {
    expect(existsSync(join(SRC, 'app/api/volunteer/[token]/clock-out/route.ts'))).toBe(true)
  })

  it('volunteer badge template registered', () => {
    const src = readFileSync(join(SRC, 'lib/templates/badges.ts'), 'utf-8')
    expect(src).toContain("id: 'volunteer'")
    expect(src).toContain('volunteer_name')
    expect(src).toContain('#dc2626')
  })

  // ── Hardening ──────────────────────────────────────────────────────────────

  it('Stripe checkout has idempotency key', () => {
    const src = readFileSync(join(SRC, 'lib/stripe/checkout.ts'), 'utf-8')
    expect(src).toContain('idempotencyKey')
    expect(src).toContain('registrationId')
  })

  it('registration actions have charges_enabled check', () => {
    const src = readFileSync(join(SRC, 'lib/registration/actions.ts'), 'utf-8')
    expect(src).toContain('charges_enabled')
    expect(src).toContain('details_submitted')
  })

  it('dead-letter API route exists', () => {
    expect(existsSync(join(SRC, 'app/api/dead-letter/route.ts'))).toBe(true)
  })

  it('dead-letter admin page exists', () => {
    expect(existsSync(join(SRC, 'app/(dashboard)/events/[slug]/dead-letters/page.tsx'))).toBe(true)
  })

  it('dead-letter tile registered', () => {
    const src = readFileSync(join(SRC, 'lib/events/admin-tiles.ts'), 'utf-8')
    expect(src).toContain("key: 'dead-letters'")
    expect(src).toContain('/dead-letters')
  })

  it('CheckInDashboard accepts volunteerStatus prop', () => {
    const src = readFileSync(join(SRC, 'components/checkin/CheckInDashboard.tsx'), 'utf-8')
    expect(src).toContain('volunteerStatus')
    expect(src).toContain('Volunteer Status')
  })

  // ── Bug fixes ──────────────────────────────────────────────────────────────

  it('certificates tile points to /certificates not /settings', () => {
    const src = readFileSync(join(SRC, 'lib/events/admin-tiles.ts'), 'utf-8')
    const certLine = src.split('\n').find(l => l.includes("key: 'certificates'"))
    expect(certLine).toBeDefined()
    expect(certLine).toContain('/certificates')
    expect(certLine).not.toContain('/settings')
  })

  it('AttendeeTable row is clickable', () => {
    const src = readFileSync(join(SRC, 'components/attendees/AttendeeTable.tsx'), 'utf-8')
    expect(src).toContain('router.push')
    expect(src).toContain('/attendees/${')
  })

  it('attendee detail page uses starts_at not start_time', () => {
    const src = readFileSync(
      join(SRC, 'app/(dashboard)/events/[slug]/attendees/[regId]/page.tsx'),
      'utf-8',
    )
    expect(src).not.toContain('start_time')
    expect(src).toContain('starts_at')
  })
})

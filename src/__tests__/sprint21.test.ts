import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const SRC = join(process.cwd(), 'src')
const MIGRATIONS = join(process.cwd(), 'supabase/migrations')

describe('Sprint 21 — Attendee App Surface', () => {
  // Migrations
  it('migration 0021 exists with backfill trigger', () => {
    const path = join(MIGRATIONS, '0021_sprint21_registration_backfill.sql')
    expect(existsSync(path)).toBe(true)
    const sql = readFileSync(path, 'utf-8')
    expect(sql).toContain('link_anonymous_registrations')
    expect(sql).toContain('trg_link_anon_regs')
    expect(sql).toContain('attendee_email')
  })

  it('migration 0022 exists with user_profiles and attendee_preferences', () => {
    const path = join(MIGRATIONS, '0022_sprint21_attendee_profiles.sql')
    expect(existsSync(path)).toBe(true)
    const sql = readFileSync(path, 'utf-8')
    expect(sql).toContain('user_profiles')
    expect(sql).toContain('display_name')
    expect(sql).toContain('attendee_preferences')
    expect(sql).toContain('enable row level security')
  })

  // Server actions
  it('profile-actions exports getUserProfile and getMyRegistrations', () => {
    const path = join(SRC, 'lib/attendees/profile-actions.ts')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('getUserProfile')
    expect(src).toContain('upsertUserProfile')
    expect(src).toContain('getMyRegistrations')
    expect(src).toContain('getMyNotifications')
    expect(src).toContain("'use server'")
  })

  it('preferences-actions exports getMyPreferences and updateMyPreferences', () => {
    const path = join(SRC, 'lib/attendees/preferences-actions.ts')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('getMyPreferences')
    expect(src).toContain('updateMyPreferences')
    expect(src).toContain("'use server'")
  })

  // /me layout
  it('/me layout exists with navigation links', () => {
    const path = join(SRC, 'app/me/layout.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('requireUser')
    expect(src).toContain('/me/profile')
    expect(src).toContain('/me/wallet')
    expect(src).toContain('/me/preferences')
    expect(src).toContain('UserMenu')
  })

  // /me landing
  it('/me landing page exists with profile completeness', () => {
    const path = join(SRC, 'app/me/page.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('getMyRegistrations')
    expect(src).toContain('getUserProfile')
    expect(src).toContain('calcCompleteness')
    expect(src).toContain('Upcoming events')
    expect(src).toContain('Quick actions')
  })

  // /me/events
  it('/me/events page exists with multi-persona event view', () => {
    const path = join(SRC, 'app/me/events/page.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('speakers')
    expect(src).toContain('volunteers')
    expect(src).toContain('RolePill')
    expect(src).toContain('EventEntry')
  })

  // /me/profile
  it('/me/profile page and client exist', () => {
    expect(existsSync(join(SRC, 'app/me/profile/page.tsx'))).toBe(true)
    const client = join(SRC, 'app/me/profile/client.tsx')
    expect(existsSync(client)).toBe(true)
    const src = readFileSync(client, 'utf-8')
    expect(src).toContain("'use client'")
    expect(src).toContain('upsertUserProfile')
    expect(src).toContain('show_in_directory')
    expect(src).toContain('interests')
  })

  // /me/wallet
  it('/me/wallet page exists with Add to Calendar links', () => {
    const path = join(SRC, 'app/me/wallet/page.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('calendar.ics')
    expect(src).toContain('View ticket')
  })

  // /me/notifications
  it('/me/notifications page exists', () => {
    const path = join(SRC, 'app/me/notifications/page.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('getMyNotifications')
  })

  // /me/settings
  it('/me/settings page and client exist', () => {
    expect(existsSync(join(SRC, 'app/me/settings/page.tsx'))).toBe(true)
    const client = join(SRC, 'app/me/settings/client.tsx')
    expect(existsSync(client)).toBe(true)
    const src = readFileSync(client, 'utf-8')
    expect(src).toContain("'use client'")
    expect(src).toContain('updateUser')
    expect(src).toContain('password')
  })

  // /me/preferences
  it('/me/preferences page and client exist', () => {
    expect(existsSync(join(SRC, 'app/me/preferences/page.tsx'))).toBe(true)
    const client = join(SRC, 'app/me/preferences/client.tsx')
    expect(existsSync(client)).toBe(true)
    const src = readFileSync(client, 'utf-8')
    expect(src).toContain("'use client'")
    expect(src).toContain('updateMyPreferences')
    expect(src).toContain('email_announcements')
    expect(src).toContain('networking_show_in_dir')
  })

  // Confirmation QR
  it('confirmation page renders QRDisplay not text-only QR', () => {
    const path = join(SRC, 'app/e/[slug]/confirmation/page.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('QRDisplay')
    expect(src).not.toContain('Your QR code ID')
  })

  // Calendar ICS route
  it('calendar.ics API route exists', () => {
    const path = join(SRC, 'app/api/registrations/[id]/calendar.ics/route.ts')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('BEGIN:VCALENDAR')
    expect(src).toContain('text/calendar')
    expect(src).toContain('createAdminClient')
  })

  // Onboarding polish
  it('onboarding page has attendee event input component', () => {
    const page = join(SRC, 'app/onboarding/page.tsx')
    const client = join(SRC, 'app/onboarding/client.tsx')
    expect(existsSync(page)).toBe(true)
    expect(existsSync(client)).toBe(true)
    const pageSrc = readFileSync(page, 'utf-8')
    expect(pageSrc).toContain('OnboardingAttendeeInput')
    const clientSrc = readFileSync(client, 'utf-8')
    expect(clientSrc).toContain("'use client'")
    expect(clientSrc).toContain('/e/')
  })
})

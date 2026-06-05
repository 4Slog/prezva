import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const SRC = join(process.cwd(), 'src')

describe('Sprint 24 — Polish & Reconciliation', () => {
  // T-300: Registration count reconciliation
  it('getEventCounts exists and exports the function', () => {
    const path = join(SRC, 'lib/registrations/counts.ts')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('getEventCounts')
    expect(src).toContain('EventCounts')
    expect(src).toContain('confirmed')
    expect(src).toContain('checkedIn')
    expect(src).toContain('cancelled')
  })

  it('event landing page uses getEventCounts for stat cards', () => {
    const path = join(SRC, 'app/(dashboard)/events/[slug]/page.tsx')
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('getEventCounts')
    expect(src).toContain('counts.confirmed')
    expect(src).toContain('counts.checkedIn')
  })

  // T-302: Attendee detail page
  it('attendee detail page exists', () => {
    const path = join(SRC, 'app/(dashboard)/events/[slug]/attendees/[regId]/page.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('createAdminClient')
    expect(src).toContain('attendee_name')
    expect(src).toContain('check_ins')
  })

  it('AttendeeTable name is a link to detail page', () => {
    const path = join(SRC, 'components/attendees/AttendeeTable.tsx')
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('eventSlug')
    expect(src).toContain('/events/${eventSlug}/attendees/${a.id}')
  })

  // T-303: Agenda timezone fix
  it('AgendaGrid uses timezone prop for time formatting', () => {
    const path = join(SRC, 'components/agenda/AgendaGrid.tsx')
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('timezone')
    expect(src).toContain('timeZone: timezone')
    expect(src).toContain('fmtTime')
  })

  it('AgendaClient accepts and passes timezone', () => {
    const path = join(SRC, 'app/(dashboard)/events/[slug]/agenda/client.tsx')
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('timezone')
  })

  // T-304: Seed cleanup migration
  it('seed cleanup migration exists', () => {
    const path = join(process.cwd(), 'supabase/migrations/0024_sprint24_seed_cleanup.sql')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('birmingham-sbw-2026')
    expect(src).toContain('starts_at')
  })

  // T-306: Speaker company duplication fix
  it('speakers-org-client deduplicates company display', () => {
    const path = join(SRC, 'app/(dashboard)/events/[slug]/speakers/speakers-org-client.tsx')
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('sp.company !== sp.job_title')
  })

  // T-307: Public event page polish
  it('public event page has ShareButtons component', () => {
    const path = join(SRC, 'app/e/[slug]/page.tsx')
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('ShareButtons')
  })

  it('ShareButtons component exists', () => {
    const path = join(SRC, 'components/events/ShareButtons.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('copyLink')
    expect(src).toContain('twitter.com')
    expect(src).toContain('linkedin.com')
    expect(src).toContain('calendarHref')
  })

  it('public event calendar ICS API route exists', () => {
    const path = join(SRC, 'app/api/events/[id]/calendar.ics/route.ts')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('VCALENDAR')
    expect(src).toContain('text/calendar')
  })

  // T-308: EmptyState component
  it('EmptyState component exists with required props', () => {
    const path = join(SRC, 'components/ui/EmptyState.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('EmptyState')
    expect(src).toContain('title')
    expect(src).toContain('description')
    expect(src).toContain('action')
  })
})

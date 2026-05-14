import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const SRC = join(process.cwd(), 'src')

describe('Template library', () => {
  it('types.ts exists', () => {
    expect(existsSync(join(SRC, 'lib/templates/types.ts'))).toBe(true)
  })

  it('survey templates file exists and exports', () => {
    const src = readFileSync(join(SRC, 'lib/templates/surveys.ts'), 'utf-8')
    expect(src).toContain('SURVEY_TEMPLATES')
    expect(src).toContain('post-event-nps-plus-3')
    expect(src).toContain('session-feedback')
  })

  it('badge templates file exists and exports 4 templates', () => {
    const src = readFileSync(join(SRC, 'lib/templates/badges.ts'), 'utf-8')
    expect(src).toContain('BADGE_TEMPLATES')
    expect(src).toContain('standard-qr')
    expect(src).toContain('vip-with-photo')
    expect(src).toContain('speaker-with-bio')
    expect(src).toContain('staff-minimal')
  })

  it('event templates file exists and exports 5 templates', () => {
    const src = readFileSync(join(SRC, 'lib/templates/events.ts'), 'utf-8')
    expect(src).toContain('EVENT_TEMPLATES')
    expect(src).toContain('annual-conference')
    expect(src).toContain('workshop')
    expect(src).toContain('networking-mixer')
    expect(src).toContain('trade-show')
    expect(src).toContain('webinar-series')
  })

  it('announcement templates file exists and exports 7 templates', () => {
    const src = readFileSync(join(SRC, 'lib/templates/announcements.ts'), 'utf-8')
    expect(src).toContain('ANNOUNCEMENT_TEMPLATES')
    expect(src).toContain("'welcome'")
    expect(src).toContain("'day-of-reminder'")
    expect(src).toContain("'last-call'")
  })

  it('icebreaker prompts file exists with 50 prompts', () => {
    const src = readFileSync(join(SRC, 'lib/templates/icebreakers.ts'), 'utf-8')
    expect(src).toContain('ICEBREAKER_PROMPTS')
    const matches = src.match(/id: 'ice-/g)
    expect(matches?.length).toBe(50)
  })

  it('trivia questions file exists with 55 questions', () => {
    const src = readFileSync(join(SRC, 'lib/templates/trivia.ts'), 'utf-8')
    expect(src).toContain('TRIVIA_QUESTIONS')
    const matches = src.match(/id: 'trv-/g)
    expect(matches?.length).toBe(55)
  })

  it('index.ts re-exports all surfaces', () => {
    const src = readFileSync(join(SRC, 'lib/templates/index.ts'), 'utf-8')
    expect(src).toContain('SURVEY_TEMPLATES')
    expect(src).toContain('BADGE_TEMPLATES')
    expect(src).toContain('EVENT_TEMPLATES')
    expect(src).toContain('ANNOUNCEMENT_TEMPLATES')
    expect(src).toContain('ICEBREAKER_PROMPTS')
    expect(src).toContain('TRIVIA_QUESTIONS')
    expect(src).toContain('getGlobalTemplates')
  })

  it('actions.ts exports saveAsTemplate and getOrgTemplates', () => {
    const src = readFileSync(join(SRC, 'lib/templates/actions.ts'), 'utf-8')
    expect(src).toContain('saveAsTemplate')
    expect(src).toContain('getOrgTemplates')
    expect(src).toContain('listOrgTemplates')
    expect(src).toContain('deleteOrgTemplate')
  })
})

describe('TemplatePicker component', () => {
  it('component file exists', () => {
    expect(existsSync(join(SRC, 'components/templates/TemplatePicker.tsx'))).toBe(true)
  })

  it('is a client component', () => {
    const src = readFileSync(join(SRC, 'components/templates/TemplatePicker.tsx'), 'utf-8')
    expect(src).toMatch(/["']use client["']/)
  })

  it('has aria dialog role', () => {
    const src = readFileSync(join(SRC, 'components/templates/TemplatePicker.tsx'), 'utf-8')
    expect(src).toContain('role="dialog"')
    expect(src).toContain('aria-modal')
  })

  it('has Escape key handler', () => {
    const src = readFileSync(join(SRC, 'components/templates/TemplatePicker.tsx'), 'utf-8')
    expect(src).toContain('Escape')
  })

  it('has Start blank option', () => {
    const src = readFileSync(join(SRC, 'components/templates/TemplatePicker.tsx'), 'utf-8')
    expect(src).toContain('Start blank')
  })
})

describe('Template wiring — surfaces', () => {
  it('surveys client imports TemplatePicker', () => {
    const src = readFileSync(join(SRC, 'app/(dashboard)/events/[slug]/surveys/client.tsx'), 'utf-8')
    expect(src).toContain('TemplatePicker')
    expect(src).toContain('createSurveyFromTemplate')
  })

  it('announcements client imports TemplatePicker', () => {
    const src = readFileSync(join(SRC, 'app/(dashboard)/events/[slug]/announcements/client.tsx'), 'utf-8')
    expect(src).toContain('TemplatePicker')
  })

  it('badges new client imports TemplatePicker', () => {
    expect(existsSync(join(SRC, 'app/(dashboard)/events/[slug]/badges/new/client.tsx'))).toBe(true)
    const src = readFileSync(join(SRC, 'app/(dashboard)/events/[slug]/badges/new/client.tsx'), 'utf-8')
    expect(src).toContain('TemplatePicker')
  })

  it('events/new imports TemplatePicker', () => {
    const src = readFileSync(join(SRC, 'app/(dashboard)/events/new/page.tsx'), 'utf-8')
    expect(src).toContain('TemplatePicker')
  })

  it('icebreakers admin page exists', () => {
    expect(existsSync(join(SRC, 'app/(dashboard)/events/[slug]/icebreakers/page.tsx'))).toBe(true)
    const src = readFileSync(join(SRC, 'app/(dashboard)/events/[slug]/icebreakers/page.tsx'), 'utf-8')
    expect(src).toContain('IcebreakersAdminClient')
  })

  it('trivia admin page exists', () => {
    expect(existsSync(join(SRC, 'app/(dashboard)/events/[slug]/trivia/page.tsx'))).toBe(true)
    const src = readFileSync(join(SRC, 'app/(dashboard)/events/[slug]/trivia/page.tsx'), 'utf-8')
    expect(src).toContain('TriviaAdminClient')
  })

  it('org templates page exists', () => {
    expect(existsSync(join(SRC, 'app/(dashboard)/orgs/[slug]/templates/page.tsx'))).toBe(true)
    const src = readFileSync(join(SRC, 'app/(dashboard)/orgs/[slug]/templates/page.tsx'), 'utf-8')
    expect(src).toContain('OrgTemplatesClient')
  })

  it('migration 0020 exists', () => {
    expect(existsSync(join(process.cwd(), 'supabase/migrations/0020_sprint20_org_templates.sql'))).toBe(true)
    const src = readFileSync(join(process.cwd(), 'supabase/migrations/0020_sprint20_org_templates.sql'), 'utf-8')
    expect(src).toContain('org_templates')
    expect(src).toContain('enable row level security')
  })
})

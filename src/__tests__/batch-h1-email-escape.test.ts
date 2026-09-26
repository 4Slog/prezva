// Batch H1 (O170, H-R1): every email that interpolates attendee, volunteer,
// speaker or organizer text escapes it; stored URLs in an href must be clean
// http(s); From display names and subjects cannot carry markup or line breaks.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import('./helpers/fake-db').createFakeDb>,
  deliver: vi.fn(async () => ({ suppressed: false })),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@trigger.dev/sdk', () => ({ schemaTask: (o: unknown) => o, task: (o: unknown) => o, schedules: { task: (o: unknown) => o }, tasks: { trigger: vi.fn() } }))
vi.mock('@trigger.dev/sdk/v3', () => ({ schedules: { task: (o: unknown) => o }, schemaTask: (o: unknown) => o, task: (o: unknown) => o, tasks: { trigger: vi.fn() } }))
vi.mock('@/trigger/lib/supabase-admin', () => ({ createAdminClient: () => h.db.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.db.client }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ ...h.db.client, from: h.db.client.from, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: 'u1' })) }))
vi.mock('@/lib/auth/assert-permission', () => ({ assertPermission: vi.fn(async () => undefined) }))
vi.mock('@/lib/integrations/ghl/location', () => ({ isEventGhlLinked: vi.fn(async () => ({ linked: false })) }))
vi.mock('@/lib/email/deliver-attendee-email', () => ({ deliverAttendeeEmail: h.deliver }))
vi.mock('@/lib/trigger', async () => (await import('./helpers/auto-mock')).autoMockModule())

import { escapeHtml, safeDisplayName, safeHref, safeSubject } from '@/lib/email/escape'
import { sendConfirmationEmail, processWaitlist } from '@/trigger/jobs/registration'
import { rosCueNotificationTask } from '@/trigger/jobs/run-of-show-cue'
import { applicationReceivedEmailHtml } from '@/lib/registration/emails'
import { resendConfirmation, rejectRegistration, selfCancelRegistration } from '@/lib/registrations/actions'
import { sendSurveyToAllAttendees } from '@/lib/surveys/actions'
import { handoutEmail } from '@/lib/speaker/handout-email'
import { respondToVolunteerShift, sendVolunteerAlert, signupAsVolunteer } from '@/lib/volunteers/actions'
import { sendVolunteerThankYouEmails } from '@/lib/volunteers/post-event'
import { inviteMember, resendInvite } from '@/lib/orgs/actions'
import { POST as lookupPOST } from '@/app/api/lookup/route'

const EVIL = `Eve <script>x</script> "Q" & 'Co'`
const SAFE = escapeHtml(EVIL)
const run = <P>(task: unknown, p: P) => (task as { run: (p: P) => Promise<unknown> }).run(p)

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, json: async () => ({ id: 'e' }), text: async () => '' }))
const sent = () => fetchMock.mock.calls.map(c => JSON.parse(String(c[1]?.body ?? '{}')) as { html: string; subject: string; from: string })
const delivered = () => h.deliver.mock.calls.map(c => (c as unknown[])[1] as { html: string; subject: string; from: string })

function expectEscaped(html: string) {
  expect(html).toContain(SAFE)
  expect(html).not.toContain('<script>')
  expect(html).not.toContain(EVIL)
}

beforeEach(() => {
  process.env.RESEND_API_KEY = 'k'
  fetchMock.mockClear()
  h.deliver.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const confirmation = (over: Record<string, unknown> = {}) => ({
  registrationId: 'r1', attendeeEmail: 'a@x.com', attendeeName: EVIL, eventTitle: EVIL,
  eventStartAt: '2026-10-01T14:00:00Z', eventSlug: 'conf', eventVenue: EVIL, qrCode: 'QR', pin: '123456',
  orgName: EVIL, eventType: 'hybrid', virtualUrl: 'https://zoom.us/j/1', ...over,
})

describe('the 12 sites', () => {
  beforeEach(() => {
    h.db = createFakeDb({ events: [{ id: 'e1', slug: 'conf' }], speakers: [], volunteers: [] })
  })

  it('1 + 12: registration confirmation — name, title, venue, org escaped; join link only when clean', async () => {
    await run(sendConfirmationEmail, confirmation())
    const [mail] = sent()
    expectEscaped(mail.html)
    expect(mail.html).toContain('href="https://zoom.us/j/1"')
    for (const bad of ['https://x.com/a"onmouseover="alert(1)', 'javascript:alert(1)', 'data:text/html,hi']) {
      fetchMock.mockClear()
      await run(sendConfirmationEmail, confirmation({ virtualUrl: bad }))
      expect(sent()[0].html).not.toContain('Join online')
      expect(sent()[0].html).not.toContain(bad)
    }
  })

  it('2: waitlist promotion — attendee name and title escaped', async () => {
    h.db = createFakeDb({ registrations: [{ id: 'w1', event_id: 'e1', status: 'waitlisted', waitlist_position: 1, attendee_name: EVIL, attendee_email: 'w@x.com', qr_code: 'Q', user_id: null }], attendee_preferences: [] })
    await run(processWaitlist, { eventId: 'e1', eventTitle: EVIL, eventSlug: 'conf' })
    const html = sent()[0].html
    expect(html).toContain(escapeHtml('Eve'))
    expect(html).toContain(SAFE) // the title
    expect(html).not.toContain('<script>')
  })

  it('3: application received', () => {
    expectEscaped(applicationReceivedEmailHtml({ attendeeName: EVIL, eventTitle: 'T', orgName: 'O', unsubUrl: 'https://prezva.app/u' }))
    expectEscaped(applicationReceivedEmailHtml({ attendeeName: 'A', eventTitle: EVIL, orgName: EVIL, unsubUrl: 'https://prezva.app/u' }))
  })

  const reg = (over: Record<string, unknown> = {}) => ({
    id: 'r1', status: 'pending', user_id: 'u1', amount_paid_cents: 0, attendee_email: 'a@x.com', attendee_name: EVIL, qr_code: 'q', event_id: 'e1',
    events: { title: EVIL, slug: 'conf', start_at: '2099-01-01T00:00:00Z', organizations: { id: 'o1', name: EVIL } }, ...over,
  })

  it('4: resend confirmation', async () => {
    h.db = createFakeDb({ registrations: [reg()] })
    await resendConfirmation('r1')
    expect(delivered()[0].html).toContain(escapeHtml('Eve'))
    expect(delivered()[0].html).toContain(SAFE)
    expect(delivered()[0].html).not.toContain('<script>')
  })

  it('4 + 10: reject — name, title, org and the rejection reason escaped', async () => {
    h.db = createFakeDb({ registrations: [reg()] })
    await rejectRegistration('r1', EVIL)
    const mail = sent().find(m => m.html?.includes('not approved'))!
    expectEscaped(mail.html)
    expect(mail.html.split(SAFE).length - 1).toBeGreaterThanOrEqual(4)
    expect(mail.from).toBe(`${safeDisplayName(EVIL)} <noreply@prezva.app>`)
  })

  it('4: self-cancel', async () => {
    h.db = createFakeDb({ registrations: [reg({ status: 'confirmed' })] })
    await selfCancelRegistration('r1')
    expectEscaped(delivered()[0].html)
    expect(delivered()[0].from).toBe(`${safeDisplayName(EVIL)} <noreply@prezva.app>`)
  })

  it('5: survey invite', async () => {
    h.db = createFakeDb({
      events: [{ id: 'e1', slug: 'conf', title: EVIL, organizations: { id: 'o1' } }],
      registrations: [{ id: 'r1', event_id: 'e1', status: 'confirmed', attendee_email: 'a@x.com', attendee_name: EVIL, qr_code: 'q' }],
    })
    await sendSurveyToAllAttendees('s1', 'e1')
    expectEscaped(delivered()[0].html)
  })

  it('6: handout notice', () => {
    const { html, subject } = handoutEmail({ firstName: EVIL, orgName: EVIL, sessionTitle: EVIL, eventTitle: EVIL, agendaUrl: 'https://prezva.app/e/c/agenda' })
    expectEscaped(html)
    expect(subject).not.toMatch(/[\r\n]/)
  })

  const vol = { id: 'v1', name: EVIL, email: 'v@x.com', event_id: 'e1', portal_access_token: 'tok', status: 'invited', role: 'general',
    events: { title: EVIL, org_id: 'o1', organizations: { name: EVIL } } }
  const owners = [{ org_id: 'o1', role: 'owner', profiles: { email: 'owner@x.com' } }]

  it('7 + 9: volunteer decline — name and free-text reason escaped', async () => {
    h.db = createFakeDb({ volunteers: [vol], org_members: owners })
    await respondToVolunteerShift('tok', 'declined', EVIL)
    const html = sent()[0].html
    expectEscaped(html)
    expect(html.split(SAFE).length - 1).toBe(3) // name, event title, reason
  })

  it('8 + 9: urgent volunteer alert — name and message escaped', async () => {
    h.db = createFakeDb({ volunteers: [vol], org_members: owners, volunteer_alerts: [] })
    await sendVolunteerAlert('tok', 'urgent', EVIL)
    expectEscaped(sent()[0].html)
    expect(sent()[0].subject).not.toMatch(/[\r\n]/)
  })

  it('9: volunteer signup confirmation escapes the applicant name', async () => {
    h.db = createFakeDb({ volunteers: [], events: [{ id: 'e1', title: EVIL, organizations: { name: EVIL } }] })
    await signupAsVolunteer('e1', EVIL, 'v@x.com', null, 'general', null)
    const mail = sent()[0]
    expectEscaped(mail.html)
  })

  it('9: volunteer thank-you', async () => {
    h.db = createFakeDb({
      events: [{ id: 'e1', title: EVIL, organizations: { name: EVIL } }],
      volunteers: [{ event_id: 'e1', status: 'confirmed', name: EVIL, email: 'v@x.com', role: 'general', clocked_in_at: null, clocked_out_at: null }],
      surveys: [{ id: 's1', event_id: 'e1', audience: 'volunteers' }],
    })
    await sendVolunteerThankYouEmails('e1')
    expectEscaped(sent()[0].html)
    expect(sent()[0].from).toBe(`${safeDisplayName(EVIL)} <noreply@prezva.app>`)
  })

  it('11: run-of-show cue — title and responsible person escaped', async () => {
    const soon = new Date(Date.now() + 10.5 * 60_000).toISOString()
    h.db = createFakeDb({ run_of_show_items: [{ id: 'i1', title: EVIL, responsible_person: EVIL, responsible_email: 'p@x.com', time_at: soon, status: 'upcoming', cue_notification_sent: false, events: { title: 'T', timezone: 'UTC', organizations: { name: EVIL } } }] })
    await run(rosCueNotificationTask, undefined)
    const mail = sent()[0]
    expectEscaped(mail.html)
    expect(mail.from).toBe(`${safeDisplayName(EVIL)} <noreply@prezva.app>`)
  })
})

describe('org invite emails (found in review)', () => {
  it('invite and reminder escape the org name', async () => {
    h.db = createFakeDb({ organizations: [{ id: 'o1', name: EVIL }], org_member_invites: [] })
    const fd = new FormData(); fd.set('email', 'new@x.com'); fd.set('role', 'staff')
    await inviteMember('o1', fd)
    expectEscaped(sent()[0].html)
    fetchMock.mockClear()
    h.db = createFakeDb({ org_invites: [{ id: 'i1', org_id: 'o1', email: 'new@x.com', role: 'staff', token: 't', organizations: { name: EVIL } }] })
    await resendInvite('i1')
    expectEscaped(sent()[0].html)
  })
})

describe('also found in review', () => {
  it('registration confirmation escapes a volunteer role on the matching volunteer row', async () => {
    h.db = createFakeDb({ events: [{ id: 'e1', slug: 'conf' }], speakers: [], volunteers: [{ event_id: 'e1', email: 'a@x.com', role: EVIL, portal_access_token: 'vt' }] })
    await run(sendConfirmationEmail, confirmation({ attendeeName: 'Ann', eventTitle: 'T', eventVenue: undefined, orgName: 'O' }))
    expectEscaped(sent()[0].html)
  })

  it('registration lookup escapes the event title', async () => {
    h.db = createFakeDb({ registrations: [{ id: 'r1', attendee_email: 'a@x.com', status: 'confirmed', events: { title: EVIL, slug: 'conf' } }] })
    await lookupPOST(new Request('https://prezva.app/api/lookup', { method: 'POST', body: JSON.stringify({ email: 'a@x.com' }) }))
    expectEscaped(sent()[0].html)
  })
})

describe('helpers', () => {
  it('safeDisplayName strips < > " and line breaks, trims, falls back to Prezva', () => {
    expect(safeDisplayName('Acme <evil@x.com>\r\nBcc: v@x.com "Co"')).toBe('Acme evil@x.comBcc: v@x.com Co')
    expect(safeDisplayName('  <>"\r\n  ')).toBe('Prezva')
    expect(safeDisplayName(null)).toBe('Prezva')
  })

  it('safeSubject removes CR/LF', () => {
    expect(safeSubject('Hi\r\nBcc: x@y.com\nthere')).toBe('Hi Bcc: x@y.com there')
  })

  it('safeHref: http(s) only, no attribute breakout', () => {
    expect(safeHref('https://zoom.us/j/1?pwd=a&b=c')).toBe('https://zoom.us/j/1?pwd=a&amp;b=c')
    for (const bad of ['javascript:alert(1)', 'https://x.com/"x', "https://x.com/'x", 'https://x.com/<x', 'ftp://x.com', 'not a url', '', null]) {
      expect(safeHref(bad as string | null)).toBeNull()
    }
  })

  it('exactly one escapeHtml definition in src', () => {
    let out = ''
    try {
      out = execFileSync('grep', ['-rnE', 'function escapeHtml|const escapeHtml ?=', 'src', '--include=*.ts', '--include=*.tsx', '--exclude-dir=__tests__', '--exclude=*.test.ts'], { encoding: 'utf8' })
    } catch (e) { out = (e as { stdout?: string }).stdout ?? '' }
    expect(out.trim().split('\n').filter(Boolean)).toEqual([expect.stringContaining('src/lib/email/escape.ts')])
  })
})

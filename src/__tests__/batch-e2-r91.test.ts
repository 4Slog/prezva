// Batch E2 (R91): speakers choose whether their email shows publicly, off by
// default. The speaker flips it from the portal (token, expiry-aware); an
// organizer needs speakers.manage; every change is audit-logged. The public
// speaker pages merge the email in server-side only when it is on, and agenda
// or session views never carry it (E-R3).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({ user: null as any, admin: null as any, allow: true, audit: [] as any[] }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.user.client) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.admin.client) }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => h.admin.client) }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: 'user-1', email: 'org@x.com' })) }))
vi.mock('@/lib/auth/assert-permission', () => ({
  assertPermission: vi.fn(async (_o: string, _u: string, key: string) => { if (!h.allow) throw new Error(`no ${key}`) }),
}))
vi.mock('@/lib/auth/permission-error', () => ({ catchPermission: (e: unknown) => ({ error: (e as Error).message }) }))
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn(async (...args: unknown[]) => { h.audit.push(args) }) }))
vi.mock('@/lib/trigger', async () => (await import('./helpers/auto-mock')).autoMockModule())
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const FUTURE = new Date(Date.now() + 10 * 86_400_000).toISOString()
const PAST = new Date(Date.now() - 90 * 86_400_000).toISOString()
const ev = (end: string) => ({ id: 'e1', title: 'A', slug: 'a', start_at: end, end_at: end })

function setup() {
  h.allow = true
  h.audit = []
  const speakers = [
    { id: 'sp1', event_id: 'e1', name: 'Ann', email: 'ann@x.com', is_published: true, show_email_publicly: false, status: 'confirmed', confirmation_token: 'tok-1', portal_token_expires_at: null, events: ev(FUTURE) },
    { id: 'sp2', event_id: 'e1', name: 'Bob', email: 'bob@x.com', is_published: true, show_email_publicly: false, status: 'confirmed', confirmation_token: 'tok-2', portal_token_expires_at: null, events: ev(FUTURE) },
    { id: 'sp3', event_id: 'e2', name: 'Old', email: 'old@x.com', is_published: true, show_email_publicly: false, status: 'confirmed', confirmation_token: 'tok-old', portal_token_expires_at: null, events: { ...ev(PAST), id: 'e2' } },
  ]
  h.admin = createFakeDb({ speakers, events: [{ id: 'e1', org_id: 'org-1' }, { id: 'e2', org_id: 'org-1' }] })
  // RLS + 0158: the user client's speaker rows carry no email.
  h.user = createFakeDb({
    speakers: speakers.map(({ email: _e, confirmation_token: _t, portal_token_expires_at: _p, ...r }) => r),
    events: [{ id: 'e1', org_id: 'org-1' }],
    org_members: [{ org_id: 'org-1', user_id: 'user-1', role: 'admin' }],
  })
}
const adminRow = (id: string) => h.admin.tables.speakers.find((r: any) => r.id === id)

describe('R91 default', () => {
  beforeEach(setup)

  it('a speaker created without the switch starts off', async () => {
    const { createSpeaker } = await import('@/lib/speaker/speaker-actions')
    const res = await createSpeaker('e1', { name: 'New', email: 'new@x.com' })
    expect(res).toMatchObject({ data: { show_email_publicly: false } })
    expect(h.audit.at(-1)?.[3]).toBe('speaker.create')
  })

  it('0158 adds the column with default false (existing speakers off)', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0158_hide_invite_code_creator_email_speaker_email.sql'), 'utf-8')
    expect(sql).toMatch(/show_email_publicly boolean NOT NULL DEFAULT false/)
  })
})

describe('speaker switch (portal token)', () => {
  beforeEach(setup)

  it('the speaker turns it on and off with their own token, audit-logged', async () => {
    const { setSpeakerEmailVisibility } = await import('@/lib/speaker/speaker-actions')
    expect(await setSpeakerEmailVisibility('tok-1', true)).toEqual({ ok: true })
    expect(adminRow('sp1').show_email_publicly).toBe(true)
    expect(adminRow('sp2').show_email_publicly).toBe(false)
    expect(await setSpeakerEmailVisibility('tok-1', false)).toEqual({ ok: true })
    expect(adminRow('sp1').show_email_publicly).toBe(false)
    expect(h.audit.map(a => [a[3], a[5], a[6]])).toEqual([
      ['speaker.email_visibility', 'sp1', { show_email_publicly: true, by: 'speaker' }],
      ['speaker.email_visibility', 'sp1', { show_email_publicly: false, by: 'speaker' }],
    ])
  })

  it('an expired link is refused and nothing is written', async () => {
    const { setSpeakerEmailVisibility } = await import('@/lib/speaker/speaker-actions')
    const { SPEAKER_LINK_EXPIRED_MESSAGE } = await import('@/lib/speaker/speaker-link')
    expect(await setSpeakerEmailVisibility('tok-old', true)).toEqual({ error: SPEAKER_LINK_EXPIRED_MESSAGE })
    expect(h.admin.writesTo('speakers')).toEqual([])
  })

  it('an unknown token or a non-boolean is refused', async () => {
    const { setSpeakerEmailVisibility } = await import('@/lib/speaker/speaker-actions')
    expect(await setSpeakerEmailVisibility('nope', true)).toEqual({ error: 'Invitation not found' })
    expect(await setSpeakerEmailVisibility('tok-1', 'yes' as unknown as boolean)).toEqual({ error: 'Invalid response' })
    expect(h.admin.writesTo('speakers')).toEqual([])
  })
})

describe('organizer switch', () => {
  beforeEach(setup)

  it('needs speakers.manage', async () => {
    h.allow = false
    const { setSpeakerEmailVisibilityAsOrganizer } = await import('@/lib/speaker/speaker-actions')
    expect(await setSpeakerEmailVisibilityAsOrganizer('e1', 'sp1', true)).toEqual({ error: 'no speakers.manage' })
    expect(h.admin.writesTo('speakers')).toEqual([])
  })

  it('with speakers.manage it writes that event’s speaker only, audit-logged', async () => {
    const { setSpeakerEmailVisibilityAsOrganizer } = await import('@/lib/speaker/speaker-actions')
    expect(await setSpeakerEmailVisibilityAsOrganizer('e1', 'sp1', true)).toEqual({ ok: true })
    expect(adminRow('sp1').show_email_publicly).toBe(true)
    expect(await setSpeakerEmailVisibilityAsOrganizer('e1', 'sp3', true)).toEqual({ error: 'Speaker not found' })
    expect(adminRow('sp3').show_email_publicly).toBe(false)
    expect(h.audit[0].slice(1, 7)).toEqual(['org-1', 'user-1', 'speaker.email_visibility', 'speaker', 'sp1', { show_email_publicly: true, by: 'organizer' }])
  })

  it('the agenda speaker form needs speakers.manage to set it', async () => {
    h.allow = false
    const { updateSpeaker, createSpeaker } = await import('@/lib/agenda/actions')
    expect(await updateSpeaker('e1', 'sp1', { show_email_publicly: true })).toEqual({ error: 'no speakers.manage' })
    expect(await createSpeaker('e1', { name: 'X', show_email_publicly: true })).toEqual({ error: 'no speakers.manage' })
    expect(h.user.writes).toEqual([])
  })

  it('the agenda form without the switch still only needs membership', async () => {
    h.allow = false
    const { updateSpeaker } = await import('@/lib/agenda/actions')
    expect(await updateSpeaker('e1', 'sp1', { bio: 'hi' })).not.toHaveProperty('error')
  })
})

describe('public pages (E-R3)', () => {
  beforeEach(setup)

  it('the speaker pages show the email only when the switch is on', async () => {
    const { getPublicSpeakers, getPublicSpeaker } = await import('@/lib/public/actions')
    let list = await getPublicSpeakers('e1', { withOptedInEmail: true })
    expect(list.map((s: any) => s.email)).toEqual([null, null])
    adminRow('sp1').show_email_publicly = true
    list = await getPublicSpeakers('e1', { withOptedInEmail: true })
    expect(list.map((s: any) => [s.id, s.email])).toEqual([['sp1', 'ann@x.com'], ['sp2', null]])
    expect(await getPublicSpeaker('e1', 'sp1')).toMatchObject({ email: 'ann@x.com' })
    expect(await getPublicSpeaker('e1', 'sp2')).toMatchObject({ email: null })
  })

  it('an unpublished speaker’s email is never merged, even with the switch on', async () => {
    adminRow('sp1').show_email_publicly = true
    adminRow('sp1').is_published = false
    const { getPublicSpeaker } = await import('@/lib/public/actions')
    expect(await getPublicSpeaker('e1', 'sp1')).toMatchObject({ email: null })
  })

  it('other callers (event home) get no email and do not read it', async () => {
    adminRow('sp1').show_email_publicly = true
    const { getPublicSpeakers } = await import('@/lib/public/actions')
    const list = await getPublicSpeakers('e1')
    expect(list.every((s: any) => !('email' in s))).toBe(true)
    expect(h.admin.client.from).not.toHaveBeenCalled()
  })

  it('agenda and session readers never select a speaker email', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/public/actions.ts'), 'utf-8')
    const agenda = src.slice(src.indexOf('export async function getPublicAgenda'), src.indexOf('// R91 / E-R3'))
    expect(agenda.length).toBeGreaterThan(0)
    expect(agenda).not.toMatch(/\bemail\b/)
    const session = src.slice(src.indexOf('export async function getPublicSession'), src.indexOf('export async function getBookmarks'))
    expect(session.length).toBeGreaterThan(0)
    expect(session).not.toMatch(/\bemail\b/)
    const home = readFileSync(join(process.cwd(), 'src/app/e/[slug]/page.tsx'), 'utf-8')
    expect(home).not.toContain('withOptedInEmail')
  })
})

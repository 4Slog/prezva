// Batch F4 (O152, F-R7..F-R12): account deletion runs from the GDPR export
// registry, keeps what the organization must keep (with nulls), refuses a sole
// owner, and reports success only when every step — including the auth user —
// succeeded.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'Ann@X.com', email_confirmed_at: '2026-01-01T00:00:00Z' } as Record<string, unknown>,
  admin: null as unknown,
  signOut: vi.fn(async () => ({ error: null })),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => h.user) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { signOut: h.signOut } }) }))

import { GDPR_EXPORT_TABLES, GDPR_REGISTRATIONS, orFilters } from '@/lib/gdpr/export'
import { deleteAccount, GDPR_ACTOR_REFERENCES } from '@/lib/gdpr/delete'
import { POST } from '@/app/api/gdpr/delete/route'
import { NextRequest } from 'next/server'

const SUBJECT = { userId: 'u1', email: 'ann@x.com' }
// Attendee photo paths are HMAC(registrationId) under this secret (prod sets it).
process.env.EMBEDDED_SESSION_SECRET = 'test-secret'

function world(opts: Parameters<typeof createFakeDb>[1] = {}) {
  return createFakeDb({
    profiles: [{ id: 'u1' }, { id: 'u2' }],
    org_members: [
      { id: 'm1', org_id: 'o1', user_id: 'u1', role: 'staff', roles: { slug: 'staff' }, organizations: { name: 'Acme' } },
      { id: 'm2', org_id: 'o1', user_id: 'u2', role: 'owner', roles: { slug: 'owner' }, organizations: { name: 'Acme' } },
    ],
    registrations: [
      { id: 'r1', user_id: 'u1', attendee_email: 'ann@x.com', attendee_name: 'Ann Lee', attendee_phone: '555', qr_code: 'qr-r1', pin: '111111', app_access_token: 'app-r1', certificate_token: 'cert-r1', amount_paid_cents: 5000, stripe_payment_intent_id: 'pi_1' },
      { id: 'r2', user_id: null, attendee_email: 'ANN@x.com', attendee_name: 'Ann (guest)', qr_code: 'qr-r2', pin: '222222' },
      { id: 'r3', user_id: 'u2', attendee_email: 'bob@x.com', attendee_name: 'Bob', qr_code: 'qr-r3', pin: '333333' },
    ],
    check_ins: [
      { id: 'c1', registration_id: 'r1', session_id: null, checked_in_by: 'u2' },
      // Staff history: u1 checked Bob in.
      { id: 'c2', registration_id: 'r3', session_id: null, checked_in_by: 'u1' },
    ],
    daily_check_ins: [{ id: 'd1', registration_id: 'r3', checked_in_by: 'u1' }],
    session_attendance: [{ id: 'sa-1', registration_id: 'r3', checked_in_by: 'u1' }],
    conversations: [
      { id: 'cv1', participant_a: 'u1', participant_b: 'u2' },
      { id: 'cv2', participant_a: 'u2', participant_b: 'u3' },
    ],
    messages: [
      { id: 'ms1', conversation_id: 'cv1', sender_id: 'u1' },
      { id: 'ms2', conversation_id: 'cv2', sender_id: 'u2' },
    ],
    speakers: [
      { id: 'sp1', user_id: 'u1', name: 'Ann Lee', email: 'ann@x.com', bio: 'Ann bio', show_email_publicly: true },
      { id: 'sp2', user_id: 'u2', name: 'Bob', email: 'bob@x.com', bio: 'Bob bio' },
    ],
    waiver_signatures: [{ id: 'w1', user_id: 'u1', registration_id: 'r1', signer_name: 'Ann Lee' }],
    email_suppressions: [{ id: 'e1', email: 'ann@x.com' }],
    survey_responses: [{ id: 'sr1', user_id: 'u1', registration_id: 'r1' }],
    survey_answers: [{ id: 'a1', response_id: 'sr1', answer_text: 'my private opinion', answer_number: 5 }],
    session_questions: [{ id: 'q1', user_id: 'u1', body: 'Why?', organizer_answer: 'Because.' }],
    session_feedback: [{ id: 'f1', user_id: 'u1', rating: 4, comment: 'Loved it' }],
    photo_contest_entries: [{ id: 'p1', event_id: 'e1', user_id: 'u1', storage_path: 'e1/u1/1.jpg' }],
    attendee_follows: [{ follower_id: 'u1', followed_id: 'u2', event_id: 'e1' }, { follower_id: 'u2', followed_id: 'u3', event_id: 'e1' }],
    push_subscriptions: [{ id: 'ps1', registration_id: 'r2' }],
    volunteers: [{ id: 'v1', user_id: 'u1', name: 'Ann', email: 'ann@x.com', portal_access_token: 'vol-tok' }],
  }, { evalOr: true, ...opts })
}

describe('registry coverage', () => {
  const all = [GDPR_REGISTRATIONS, ...GDPR_EXPORT_TABLES]

  it('every registry table has a delete rule', () => {
    const missing = all.filter(t => !t.deleteRule || !['delete', 'anonymise', 'keep', 'profile'].includes(t.deleteRule.action))
    expect(missing.map(t => t.table)).toEqual([])
    for (const t of all) if (t.deleteRule.action === 'keep') expect(t.deleteRule.reason.length).toBeGreaterThan(10)
    expect(all.filter(t => t.deleteRule.action === 'profile').map(t => t.table)).toEqual(['profiles'])
  })

  it('the rulings: waivers + suppressions kept, surveys + Q&A anonymised, registrations anonymised', () => {
    const rule = (t: string) => all.find(x => x.table === t)!.deleteRule.action
    expect(rule('waiver_signatures')).toBe('keep')
    expect(rule('email_suppressions')).toBe('keep')
    expect(rule('survey_responses')).toBe('anonymise')
    expect(rule('session_questions')).toBe('anonymise')
    expect(rule('registrations')).toBe('anonymise')
  })

  it('every column an anonymise rule writes exists (generated types)', () => {
    const src = readFileSync(join(process.cwd(), 'src/types/database.generated.ts'), 'utf-8')
    const colsOf = (table: string) => {
      const m = new RegExp(`\\n {6}${table}: \\{\\n {8}Row: \\{\\n([\\s\\S]*?)\\n {8}\\}`).exec(src)
      return m ? [...m[1].matchAll(/^\s+([a-z_0-9]+)\??:/gm)].map(c => c[1]) : null
    }
    const bad: string[] = []
    for (const t of all) {
      const r = t.deleteRule
      if (r.action !== 'anonymise') continue
      const cols = colsOf(t.table)
      expect(cols, t.table).not.toBeNull()
      for (const c of Object.keys(r.set)) if (!cols!.includes(c)) bad.push(`${t.table}.${c}`)
      if (r.children) {
        const cc = colsOf(r.children.table)!
        for (const c of [r.children.fk, ...Object.keys(r.children.set)]) if (!cc.includes(c)) bad.push(`${r.children.table}.${c}`)
      }
    }
    for (const { table, col } of GDPR_ACTOR_REFERENCES) if (!colsOf(table)?.includes(col)) bad.push(`${table}.${col}`)
    expect(bad).toEqual([])
  })
})

describe('deleteAccount', () => {
  it('deletes fully: profile + auth user gone, history kept with nulls', async () => {
    const db = world()
    const res = await deleteAccount(db.client, SUBJECT)
    expect(res).toEqual({ ok: true })
    const T = db.tables

    expect(db.deletedUsers).toEqual(['u1'])
    expect(T.profiles.map(p => p.id)).toEqual(['u2'])
    expect(T.org_members.map(m => m.id)).toEqual(['m2'])

    // Registrations: kept (financial), personal data gone, secrets rotated; matched by user id AND guest email.
    const r1 = T.registrations.find(r => r.id === 'r1')!
    expect(r1).toMatchObject({ user_id: null, attendee_name: 'Deleted User', attendee_email: 'deleted-r1@redacted.local', attendee_phone: null, amount_paid_cents: 5000, stripe_payment_intent_id: 'pi_1' })
    expect(r1.qr_code).not.toBe('qr-r1')
    expect(r1.app_access_token).not.toBe('app-r1')
    expect(r1.certificate_token).not.toBe('cert-r1')
    expect(r1.pin).toMatch(/^\d{6}$/)
    expect(T.registrations.find(r => r.id === 'r2')).toMatchObject({ attendee_name: 'Deleted User', attendee_email: 'deleted-r2@redacted.local' })
    expect(T.registrations.find(r => r.id === 'r3')).toMatchObject({ attendee_name: 'Bob', user_id: 'u2', qr_code: 'qr-r3' })

    // Attendance and staff history kept; actor references released.
    expect(T.check_ins.map(c => c.id)).toEqual(['c1', 'c2'])
    expect(T.daily_check_ins[0].checked_in_by).toBeNull()
    expect(T.session_attendance[0].checked_in_by).toBeNull()

    // Conversations + messages the subject is part of are gone; others untouched.
    expect(T.conversations.map(c => c.id)).toEqual(['cv2'])
    expect(T.messages.map(m => m.id)).toEqual(['ms2'])

    // Speaker row anonymised, other speakers untouched.
    expect(T.speakers.find(s => s.id === 'sp1')).toMatchObject({ user_id: null, name: 'Deleted User', email: null, bio: null, show_email_publicly: false })
    expect(T.speakers.find(s => s.id === 'sp2')).toMatchObject({ name: 'Bob', email: 'bob@x.com' })

    // Volunteers: anonymised, portal token rotated.
    expect(T.volunteers[0]).toMatchObject({ user_id: null, name: 'Deleted User', email: 'deleted-v1@redacted.local' })
    expect(T.volunteers[0].portal_access_token).not.toBe('vol-tok')

    // Deleted content, including storage and id-less tables.
    expect(T.photo_contest_entries).toEqual([])
    expect(db.removedFiles).toContain('e1/u1/1.jpg')
    expect(T.attendee_follows).toEqual([{ follower_id: 'u2', followed_id: 'u3', event_id: 'e1' }])
    expect(T.push_subscriptions).toEqual([])
  })

  it('keeps waivers and suppressions (F-R7, F-R8)', async () => {
    const db = world()
    await deleteAccount(db.client, SUBJECT)
    expect(db.tables.waiver_signatures).toEqual([{ id: 'w1', user_id: 'u1', registration_id: 'r1', signer_name: 'Ann Lee' }])
    expect(db.tables.email_suppressions).toEqual([{ id: 'e1', email: 'ann@x.com' }])
    expect(db.writesTo('waiver_signatures')).toEqual([])
    expect(db.writesTo('email_suppressions')).toEqual([])
  })

  it('anonymises surveys and Q&A (F-R9, F-R10)', async () => {
    const db = world()
    await deleteAccount(db.client, SUBJECT)
    expect(db.tables.survey_responses[0]).toMatchObject({ id: 'sr1', user_id: null, registration_id: null })
    expect(db.tables.survey_answers[0]).toMatchObject({ id: 'a1', answer_text: null, answer_number: 5 })
    expect(db.tables.session_questions[0]).toMatchObject({ id: 'q1', user_id: null, body: '[deleted]', organizer_answer: 'Because.' })
    expect(db.tables.session_feedback[0]).toMatchObject({ id: 'f1', user_id: null, comment: null, rating: 4 })
  })

  it('refuses the sole owner of an org and writes nothing (F-R11)', async () => {
    const db = world()
    db.tables.org_members[0] = { ...db.tables.org_members[0], role: 'owner', roles: { slug: 'owner' } }
    db.tables.org_members[1] = { ...db.tables.org_members[1], role: 'staff', roles: { slug: 'staff' } }
    expect(await deleteAccount(db.client, SUBJECT)).toEqual({ ok: false, reason: 'sole_owner', orgs: ['Acme'] })
    expect(db.writes).toEqual([])
    expect(db.deletedUsers).toEqual([])
  })

  it('a co-owner may delete', async () => {
    const db = world()
    db.tables.org_members[0] = { ...db.tables.org_members[0], role: 'owner', roles: { slug: 'owner' } }
    expect((await deleteAccount(db.client, SUBJECT)).ok).toBe(true)
  })

  it.each(['registrations', 'speakers', 'messages', 'daily_check_ins', 'check_ins', 'push_subscriptions'])(
    'an error on %s stops the run: failure returned, profile and auth user remain',
    async (table) => {
      const db = world({ failWrite: { [table]: { code: 'XX000', message: `${table} broke` } } })
      const res = await deleteAccount(db.client, SUBJECT)
      expect(res).toMatchObject({ ok: false, reason: 'failed' })
      expect(db.deletedUsers).toEqual([])
      expect(db.tables.profiles.map(p => p.id)).toContain('u1')
    },
  )

  it('a retry after a mid-run failure still finds registration-linked rows', async () => {
    const db = world({ failWrite: { speakers: { code: 'XX000', message: 'boom' } } })
    db.tables.registration_field_responses = [{ id: 'rf1', registration_id: 'r2', value: 'shoe size 9' }]
    expect((await deleteAccount(db.client, SUBJECT)).ok).toBe(false)
    // Registrations are anonymised last, so they are still findable…
    expect(db.tables.registrations.find(r => r.id === 'r1')).toMatchObject({ attendee_name: 'Ann Lee' })
    // …and the retry (fault gone) completes everything.
    const rerun = createFakeDb(db.tables, { evalOr: true })
    expect((await deleteAccount(rerun.client, SUBJECT)).ok).toBe(true)
    expect(rerun.tables.registration_field_responses).toEqual([])
    expect(rerun.tables.push_subscriptions).toEqual([])
    expect(rerun.deletedUsers).toEqual(['u1'])
  })

  it('a group-conversation creator is refused before any write', async () => {
    const db = world()
    db.tables.group_conversations = [{ id: 'g1', created_by: 'u1', name: 'Team' }]
    expect(await deleteAccount(db.client, SUBJECT)).toEqual({ ok: false, reason: 'blocked', table: 'group_conversations' })
    expect(db.writes).toEqual([])
    expect(db.removedFiles).toEqual([])
  })

  it('removes the avatar and attendee photos by derived path, and clears staff check-in emails', async () => {
    const db = world()
    db.tables.check_ins.push({ id: 'c3', registration_id: 'r3', session_id: 's1', checked_in_by: null, checked_in_by_email: 'Ann@x.com' })
    db.tables.check_ins.push({ id: 'c4', registration_id: 'r3', session_id: 's2', checked_in_by: null, checked_in_by_email: 'other@x.com' })
    db.tables.check_ins[1].checked_in_by_email = 'ann@x.com'
    expect((await deleteAccount(db.client, SUBJECT)).ok).toBe(true)
    expect(db.removedFiles).toEqual(expect.arrayContaining(['u1/avatar.jpg', 'u1/avatar.png', 'u1/avatar.webp']))
    expect(db.removedFiles.filter(p => p.startsWith('attendee-photos/'))).toHaveLength(6) // r1 + r2 × 3 extensions
    expect(db.tables.check_ins.find(c => c.id === 'c2')).toMatchObject({ checked_in_by: null, checked_in_by_email: null })
    expect(db.tables.check_ins.find(c => c.id === 'c3')!.checked_in_by_email).toBeNull()
    expect(db.tables.check_ins.find(c => c.id === 'c4')!.checked_in_by_email).toBe('other@x.com')
  })

  it('an auth delete error is a failure', async () => {
    const db = world()
    db.client.auth.admin.deleteUser = vi.fn(async () => ({ data: null, error: { message: 'auth down' } }))
    expect(await deleteAccount(db.client, SUBJECT)).toEqual({ ok: false, reason: 'failed', step: 'auth user', message: 'auth down' })
  })

  it('never removes a storage object outside the subject folder', async () => {
    const db = world()
    db.tables.photo_contest_entries = [
      { id: 'p1', event_id: 'e1', user_id: 'u1', storage_path: 'e1/u1/1.jpg' },
      { id: 'p2', event_id: 'e1', user_id: 'u1', storage_path: 'e1/victim/2.jpg' },
      { id: 'p3', event_id: 'e1', user_id: 'u1', storage_path: 'e1/u1/../victim/3.jpg' },
    ]
    db.tables.community_photos = [
      { id: 'cp1', event_id: 'e1', user_id: 'u1', photo_url: 'https://s.co/storage/v1/object/public/event-photos/e1/community/u1/4.jpg' },
      { id: 'cp2', event_id: 'e1', user_id: 'u1', photo_url: 'https://s.co/storage/v1/object/public/event-photos/e1/community/victim/5.jpg' },
    ]
    expect((await deleteAccount(db.client, SUBJECT)).ok).toBe(true)
    const eventPhotos = db.removedFiles.filter(p => p.startsWith('e1/')).sort()
    expect(eventPhotos).toEqual(['e1/community/u1/4.jpg', 'e1/u1/1.jpg'])
    expect(db.tables.photo_contest_entries).toEqual([])
    expect(db.tables.community_photos).toEqual([])
  })

  it('orFilters drops the email condition when the email contains *', () => {
    expect(orFilters(GDPR_REGISTRATIONS.match, { userId: 'u1', email: 'ann*@x.com' }, [])).toEqual(['user_id.eq."u1"'])
    expect(orFilters(GDPR_REGISTRATIONS.match, { userId: 'u1', email: 'ann@x.com' }, [])).toEqual(['user_id.eq."u1",attendee_email.ilike."ann@x.com"'])
  })

  it('an email containing * never matches by email (PostgREST wildcard)', async () => {
    const db = world()
    db.tables.registrations.push({ id: 'r4', user_id: 'u9', attendee_email: 'annie@x.com', attendee_name: 'Annie', qr_code: 'qr-r4', pin: '444444' })
    await deleteAccount(db.client, { userId: 'u1', email: 'ann*@x.com' })
    expect(db.tables.registrations.find(r => r.id === 'r4')).toMatchObject({ attendee_name: 'Annie' })
    expect(db.tables.registrations.find(r => r.id === 'r2')).toMatchObject({ attendee_name: 'Ann (guest)' })
    expect(db.tables.registrations.find(r => r.id === 'r1')).toMatchObject({ attendee_name: 'Deleted User' })
  })

  it('without a verified email, email-only rows are untouched', async () => {
    const db = world()
    await deleteAccount(db.client, { userId: 'u1', email: null })
    expect(db.tables.registrations.find(r => r.id === 'r2')).toMatchObject({ attendee_name: 'Ann (guest)' })
    expect(db.tables.email_suppressions).toHaveLength(1)
  })
})

describe('POST /api/gdpr/delete', () => {
  const call = () => POST(new NextRequest('https://prezva.app/api/gdpr/delete', { method: 'POST', body: JSON.stringify({ confirm: true }) }))

  beforeEach(() => { h.signOut.mockClear() })

  it('success only when everything succeeded', async () => {
    const db = world()
    h.admin = db.client
    const res = await call()
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
    expect(db.deletedUsers).toEqual(['u1'])
  })

  it('a failed step is reported as failure, never as deleted', async () => {
    h.admin = world({ failWrite: { speakers: { code: 'XX000', message: 'boom' } } }).client
    const res = await call()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/could not be deleted/)
    expect(JSON.stringify(body)).not.toMatch(/has been deleted/)
    expect(h.signOut).not.toHaveBeenCalled()
  })

  it('sole owner gets a clear 409', async () => {
    const db = world()
    db.tables.org_members = [{ id: 'm1', org_id: 'o1', user_id: 'u1', role: 'owner', roles: { slug: 'owner' }, organizations: { name: 'Acme' } }]
    h.admin = db.client
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('You are the only owner of Acme. Transfer ownership to another member before deleting your account.')
  })

  it('requires { confirm: true }', async () => {
    h.admin = world().client
    const res = await POST(new NextRequest('https://prezva.app/api/gdpr/delete', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(400)
  })
})

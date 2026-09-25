// E-R4 GDPR export: every table with a personal-data column is exported or
// explicitly excluded with a reason; matching is by user id or the verified
// email (plus the registrations those find); any query error fails the export.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('server-only', () => ({}))
import { GDPR_EXPORT_TABLES, GDPR_EXCLUDED_TABLES, GDPR_REGISTRATIONS, buildGdprExport } from '@/lib/gdpr/export'

const PERSONAL = /^(user_id|email|attendee_email|registration_id|author_id|sender_id|requester_id|recipient_id|participant_a|participant_b|created_by|uploaded_by|invited_by|contact_email|responsible_email|ghl_creator_email|notification_email)$/
// Tables in the live schema (2026-09-25) with such a column but missing from
// the generated types (which lag the database).
const LIVE_ONLY = ['user_notifications']
// Staff-actor columns (who checked someone in) — on tables already exported
// for the attendee, so they do not make a table personal on their own.
const ACTOR_ONLY_OK = new Set(['checked_in_by', 'checked_in_by_email'])

function personalTablesFromTypes(): string[] {
  const src = readFileSync(join(process.cwd(), 'src/types/database.generated.ts'), 'utf-8')
  const tablesStart = src.indexOf('    Tables: {')
  const viewsStart = src.indexOf('    Views: {', tablesStart)
  const body = src.slice(tablesStart, viewsStart)
  const out: string[] = []
  for (const m of body.matchAll(/\n {6}([a-z_0-9]+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/g)) {
    const cols = [...m[2].matchAll(/^\s+([a-z_0-9]+)\??:/gm)].map(c => c[1]).filter(c => !ACTOR_ONLY_OK.has(c))
    if (m[1] === 'profiles' || cols.some(c => PERSONAL.test(c))) out.push(m[1])
  }
  return out
}

describe('GDPR export coverage', () => {
  const exported = new Set([GDPR_REGISTRATIONS.table, ...GDPR_EXPORT_TABLES.map(t => t.table), 'survey_answers'])

  it('every personal-data table is exported or excluded with a reason', () => {
    const found = [...personalTablesFromTypes(), ...LIVE_ONLY]
    expect(found.length).toBeGreaterThan(40)
    const unclassified = found.filter(t => !exported.has(t) && !(t in GDPR_EXCLUDED_TABLES))
    expect(unclassified).toEqual([])
  })

  it('no table is both exported and excluded; every exclusion has a reason', () => {
    for (const [t, why] of Object.entries(GDPR_EXCLUDED_TABLES)) {
      expect(exported.has(t)).toBe(false)
      expect(why.length).toBeGreaterThan(10)
    }
  })
})

// A recording fake: each .from(t).select('*').or(filter) / .in() returns the
// configured rows, and records the filter so matching can be asserted.
function fakeDb(rows: Record<string, any[]>, failOn?: string) {
  const calls: Array<{ table: string; or?: string; in?: [string, string[]]; range?: [number, number] }> = []
  const db: any = {
    from: vi.fn((table: string) => {
      const call: any = { table }
      calls.push(call)
      const b: any = {
        select: () => b,
        or: (f: string) => { call.or = f; return b },
        in: (c: string, v: string[]) => { call.in = [c, v]; return b },
        range: (from: number, to: number) => { call.range = [from, to]; return b },
        then: (ok: any, bad: any) => Promise.resolve(
          table === failOn ? { data: null, error: { message: 'boom' } }
            : { data: (rows[table] ?? []).slice(call.range?.[0] ?? 0, (call.range?.[1] ?? 1e9) + 1), error: null },
        ).then(ok, bad),
      }
      return b
    }),
  }
  return { db, calls }
}

describe('buildGdprExport', () => {
  let rows: Record<string, any[]>
  beforeEach(() => {
    rows = {
      registrations: [{ id: 'reg-guest', user_id: null, attendee_email: 'Ann@X.com', qr_code: 'QR' }],
      speakers: [{ id: 'sp1', email: 'ann@x.com', confirmation_token: 'secret', portal_token_expires_at: null }],
      push_subscriptions: [{ id: 'p1', registration_id: 'reg-guest', endpoint: 'https://push', p256dh: 'k', auth: 'a' }],
      survey_responses: [{ id: 'resp-1', user_id: 'u1' }],
      survey_answers: [{ id: 'a1', response_id: 'resp-1', answer_text: 'yes' }],
    }
  })

  it('matches by user id and verified email, and follows the registrations found', async () => {
    const { db, calls } = fakeDb(rows)
    const out = await buildGdprExport(db, { userId: 'u1', email: 'ann@x.com' })
    const reg = calls.find(c => c.table === 'registrations')!
    expect(reg.or).toBe('user_id.eq."u1",attendee_email.ilike."ann@x.com"')
    expect(calls.find(c => c.table === 'check_ins')!.or).toBe('registration_id.in.("reg-guest")')
    expect(calls.find(c => c.table === 'speakers')!.or).toBe('user_id.eq."u1",email.ilike."ann@x.com"')
    expect(out.tables.registrations).toHaveLength(1)
    expect(out.tables.survey_answers).toEqual([{ id: 'a1', response_id: 'resp-1', answer_text: 'yes' }])
  })

  it('without a verified email, email-only tables are not queried', async () => {
    const { db, calls } = fakeDb(rows)
    await buildGdprExport(db, { userId: 'u1', email: null })
    expect(calls.find(c => c.table === 'registrations')!.or).toBe('user_id.eq."u1"')
    expect(calls.some(c => c.table === 'abandoned_carts')).toBe(false)
  })

  it('escapes LIKE wildcards and quotes in the email', async () => {
    const { db, calls } = fakeDb(rows)
    await buildGdprExport(db, { userId: 'u1', email: 'a_b%c@x.com' })
    expect(calls.find(c => c.table === 'abandoned_carts')!.or).toBe('email.ilike."a\\\\_b\\\\%c@x.com"')
  })

  it('strips bearer secrets from exported rows', async () => {
    rows.registrations[0] = { ...rows.registrations[0], app_access_token: 't', press_token: 't', certificate_token: 't', pin: '1234' }
    rows.staff_invites = [{ id: 'si', email: 'ann@x.com', token: 'invite-secret' }]
    rows.sponsor_contacts = [{ id: 'sc', email: 'ann@x.com', portal_token: 'p' }]
    rows.invite_codes = [{ id: 'ic', email: 'ann@x.com', code: 'REDEEM-ME' }]
    rows.org_invites = [{ id: 'oi', email: 'ann@x.com', token: 'join-secret', role: 'admin' }]
    const { db } = fakeDb(rows)
    const out = await buildGdprExport(db, { userId: 'u1', email: 'ann@x.com' })
    expect(out.tables.speakers[0]).not.toHaveProperty('confirmation_token')
    expect(out.tables.push_subscriptions[0]).toEqual({ id: 'p1', registration_id: 'reg-guest', endpoint: 'https://push' })
    expect(out.tables.registrations[0]).toEqual({ id: 'reg-guest', user_id: null, attendee_email: 'Ann@X.com' })
    expect(out.tables.staff_invites[0]).toEqual({ id: 'si', email: 'ann@x.com' })
    expect(out.tables.sponsor_contacts[0]).toEqual({ id: 'sc', email: 'ann@x.com' })
    expect(out.tables.invite_codes[0]).toEqual({ id: 'ic', email: 'ann@x.com' })
    expect(out.tables.org_invites[0]).toEqual({ id: 'oi', email: 'ann@x.com', role: 'admin' })
    expect(JSON.stringify(out)).not.toMatch(/secret|1234|REDEEM|"QR"/)
  })

  it('pages past the 1000-row cap instead of truncating', async () => {
    rows.audit_logs = Array.from({ length: 2345 }, (_, i) => ({ id: `a${i}`, user_id: 'u1' }))
    const { db } = fakeDb(rows)
    const out = await buildGdprExport(db, { userId: 'u1', email: null })
    expect(out.tables.audit_logs).toHaveLength(2345)
  })

  it('splits many registration ids across requests and merges without duplicates', async () => {
    rows.registrations = Array.from({ length: 250 }, (_, i) => ({ id: `r${i}`, user_id: 'u1' }))
    rows.check_ins = [{ id: 'c1', registration_id: 'r1' }]
    const { db, calls } = fakeDb(rows)
    const out = await buildGdprExport(db, { userId: 'u1', email: null })
    const ci = calls.filter(c => c.table === 'check_ins')
    expect(ci).toHaveLength(3)
    for (const c of ci) expect((c.or!.match(/"r\d+"/g) ?? []).length).toBeLessThanOrEqual(100)
    expect(out.tables.check_ins).toEqual([{ id: 'c1', registration_id: 'r1' }])
  })

  it('any query error fails the whole export', async () => {
    const { db } = fakeDb(rows, 'session_notes')
    await expect(buildGdprExport(db, { userId: 'u1', email: 'ann@x.com' })).rejects.toThrow('session_notes: boom')
  })
})

describe('GET /api/gdpr/export', () => {
  it('returns 500 with an error, never a partial file, when a read fails', async () => {
    vi.resetModules()
    vi.doMock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: 'u1', email: 'Ann@X.com', email_confirmed_at: '2026-01-01' })) }))
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fakeDb({}, 'messages').db) }))
    const { GET } = await import('@/app/api/gdpr/export/route')
    const res = await GET()
    expect(res.status).toBe(500)
    expect(await res.json()).toHaveProperty('error')
  })

  it('an unconfirmed email is not used for matching', async () => {
    vi.resetModules()
    const f = fakeDb({})
    vi.doMock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: 'u1', email: 'ann@x.com', email_confirmed_at: null })) }))
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => f.db) }))
    const { GET } = await import('@/app/api/gdpr/export/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(f.calls.find(c => c.table === 'registrations')!.or).toBe('user_id.eq."u1"')
  })
})

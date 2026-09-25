// Security hotfix (0157): bearer-token columns on speakers / sessions / events /
// event_sponsors are service-role only. These tests pin the three pieces:
// the migration grants everything else back and re-mints every token; no user
// (RLS) client selects '*' or a secret column on those tables; and the
// token-authorized speaker confirm/decline read the token with the admin
// client and write only the token's own row.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createFakeDb } from './helpers/fake-db'
import {
  EVENT_COLUMNS, SESSION_COLUMNS, SPEAKER_COLUMNS, SPONSOR_COLUMNS, SECRET_TOKEN_COLUMNS,
} from '@/lib/db/public-columns'

const SECRETS = Object.values(SECRET_TOKEN_COLUMNS).flat() as string[]
const TABLES = Object.keys(SECRET_TOKEN_COLUMNS)

describe('public column lists', () => {
  it.each([
    ['events', EVENT_COLUMNS], ['sessions', SESSION_COLUMNS], ['speakers', SPEAKER_COLUMNS], ['event_sponsors', SPONSOR_COLUMNS],
  ])('%s list names no secret column and no wildcard', (_t, cols) => {
    const names = cols.split(',').map(c => c.trim())
    expect(names).not.toContain('*')
    for (const s of SECRETS) expect(names).not.toContain(s)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('0157 migration', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0157_close_public_token_columns.sql'), 'utf-8')
    .replace(/--.*$/gm, '')

  // 0158 closes the rest of SECRET_TOKEN_COLUMNS (invite code, creator and
  // speaker email).
  const CLOSED_BY_0157 = {
    events: ['mc_token', 'lobby_token'],
    sessions: ['session_qr_token'],
    speakers: ['confirmation_token', 'portal_token_expires_at'],
    event_sponsors: ['portal_access_token'],
  }
  it('covers every bearer-token column of every table', () => {
    for (const [table, cols] of Object.entries(CLOSED_BY_0157)) {
      expect(sql).toContain(`('${table}',`)
      for (const c of cols) expect(sql).toContain(`'${c}'`)
    }
  })

  it('revokes the table-level SELECT before granting the column list', () => {
    const revoke = sql.indexOf("REVOKE SELECT ON public.%I FROM anon, authenticated")
    const grant = sql.indexOf("GRANT SELECT (%s) ON public.%I TO anon, authenticated")
    expect(revoke).toBeGreaterThan(-1)
    expect(grant).toBeGreaterThan(revoke)
    expect(sql).toMatch(/column_name <> ALL \(spec\.secret\)/)
  })

  it('re-mints every exposed token in its existing format', () => {
    expect(sql).toMatch(/SET confirmation_token = encode\(gen_random_bytes\(24\), 'hex'\)/)
    expect(sql).toMatch(/SET session_qr_token = encode\(gen_random_bytes\(16\), 'hex'\)/)
    expect(sql).toMatch(/mc_token = CASE WHEN mc_token IS NOT NULL THEN gen_random_uuid\(\) END/)
    expect(sql).toMatch(/lobby_token = CASE WHEN lobby_token IS NOT NULL THEN gen_random_uuid\(\) END/)
    expect(sql).toMatch(/SET portal_access_token = encode\(gen_random_bytes\(16\), 'hex'\)/)
  })
})

describe('0158 migration', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0158_hide_invite_code_creator_email_speaker_email.sql'), 'utf-8')
    .replace(/--.*$/gm, '')

  it('closes the invite code, creator email and speaker email, and repeats 0157’s secrets for those tables', () => {
    expect(sql).toContain("('events',   ARRAY['mc_token', 'lobby_token', 'registration_invite_code', 'ghl_creator_email'])")
    expect(sql).toContain("('speakers', ARRAY['confirmation_token', 'portal_token_expires_at', 'email'])")
  })

  it('adds show_email_publicly (default off) before the grant, so it is granted', () => {
    const add = sql.indexOf('ADD COLUMN IF NOT EXISTS show_email_publicly boolean NOT NULL DEFAULT false')
    expect(add).toBeGreaterThan(-1)
    expect(sql.indexOf('GRANT SELECT (%s) ON public.%I TO anon, authenticated')).toBeGreaterThan(add)
    expect(sql.indexOf("REVOKE SELECT ON public.%I FROM anon, authenticated")).toBeGreaterThan(add)
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema'/)
  })

  it('together with 0157, closes every service-only column', () => {
    const s157 = readFileSync(join(process.cwd(), 'supabase/migrations/0157_close_public_token_columns.sql'), 'utf-8').replace(/--.*$/gm, '')
    const both = s157 + sql
    for (const [table, cols] of Object.entries(SECRET_TOKEN_COLUMNS)) {
      expect(both).toContain(`('${table}',`)
      for (const c of cols) expect(both).toContain(`'${c}'`)
    }
  })

  it('the speaker list grants show_email_publicly and not email', () => {
    const names = SPEAKER_COLUMNS.split(',').map(c => c.trim())
    expect(names).toContain('show_email_publicly')
    expect(names).not.toContain('email')
  })
})

// Static guard: a user client (createClient from supabase/server or
// supabase/client) reading one of these tables must name its columns — '*',
// a bare .select() after a write, or a service-only column now fails in
// production. Checked per table (speakers.email is service-only,
// organizations.email is not), including embeds of these tables from any
// user-client chain.
describe('no user-client wildcard or secret read on token tables', () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) return name === '__tests__' ? [] : files(p)
      return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [p] : []
    })
  }
  // The receiver's nearest preceding assignment decides: createClient() is a
  // user client; createAdminClient()/createServiceClient() are not.
  const userVar = (src: string, v: string, at: number) => {
    const assigns = [...src.slice(0, at).matchAll(new RegExp(`(?:const|let)\\s+${v}\\s*=\\s*([^\\n;]+)`, 'g'))]
    const last = assigns.at(-1)?.[1] ?? ''
    return /(?:^|\W)createClient\(/.test(last)
  }
  const SECRET_OF = SECRET_TOKEN_COLUMNS as unknown as Record<string, readonly string[]>
  const hasSecret = (table: string, text: string) =>
    SECRET_OF[table].some(c => new RegExp(`(?<![\\w.])${c}\\b`).test(text))
  // The top level of a select string, with embedded "rel(...)" groups removed.
  const topLevel = (sel: string) => { let prev; do { prev = sel; sel = sel.replace(/[\w!:]+\s*\([^()]*\)/g, '') } while (sel !== prev); return sel }
  const EMBED = new RegExp(`(?<![\\w.])(${TABLES.join('|')})(?:!\\w+)?\\s*\\(([^()]*)\\)`, 'g')

  it('finds none', () => {
    const hits: string[] = []
    for (const f of files(join(process.cwd(), 'src'))) {
      const src = readFileSync(f, 'utf-8')
      if (!/supabase\/(server|client)'/.test(src)) continue
      for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*\.from\(\s*'(\w+)'\s*\)/g)) {
        if (!userVar(src, m[1], m.index!)) continue
        const table = m[2]
        const rest = src.slice(m.index! + m[0].length)
        const end = rest.search(/\n\s*\n|;\s*\n|\.from\(/)
        const chain = end === -1 ? rest : rest.slice(0, end)
        const line = src.slice(0, m.index).split('\n').length
        const where = `${f.replace(process.cwd() + '/', '')}:${line}`
        if (TABLES.includes(table)) {
          // Filters and orderings name columns as their first string argument
          // (.eq('email', …), .order(…), .or('email.eq.…')); insert/update
          // payloads may still write these columns — only SELECT is revoked.
          const filterArgs = [...chain.matchAll(/\.(?!select\b)\w+\(\s*([`'"])([\s\S]*?)\1/g)].map(x => x[2]).join(' ')
          const selects = [...chain.matchAll(/\.select\(\s*([`'"])([\s\S]*?)\1\s*\)/g)].map(x => x[2])
          if (/\.select\(\s*['`]\s*\*/.test(chain) || /\.select\(\s*\)/.test(chain)
            || selects.some(sel => hasSecret(table, topLevel(sel)))
            || hasSecret(table, filterArgs)) {
            hits.push(where)
            continue
          }
        }
        for (const e of chain.matchAll(EMBED)) {
          if (e[2].trim() === '*' || hasSecret(e[1], e[2])) { hits.push(`${where} (embed ${e[1]})`); break }
        }
      }
    }
    expect(hits).toEqual([])
  })
})

const h = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.db.client) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => { throw new Error('user client must not be used for token lookups') }) }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => h.db.client) }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('@/lib/trigger', async () => (await import('./helpers/auto-mock')).autoMockModule())

const FUTURE = new Date(Date.now() + 86_400_000).toISOString()

describe('speaker confirm / decline by token', () => {
  beforeEach(() => {
    h.db = createFakeDb({
      speakers: [
        { id: 'sp1', event_id: 'e1', name: 'Ann', email: null, status: 'invited', confirmation_token: 'tok-1', portal_token_expires_at: null, events: { id: 'e1', title: 'A', slug: 'a', start_at: FUTURE, end_at: FUTURE } },
        { id: 'sp2', event_id: 'e1', name: 'Bob', email: null, status: 'invited', confirmation_token: 'tok-2', portal_token_expires_at: null, events: { id: 'e1', title: 'A', slug: 'a', start_at: FUTURE, end_at: FUTURE } },
      ],
      org_speakers: [],
    })
  })
  const row = (id: string) => h.db.tables.speakers.find((r: any) => r.id === id)

  it('confirm updates only the token’s own speaker', async () => {
    const { confirmSpeakerSlot } = await import('@/lib/speaker/speaker-actions')
    expect(await confirmSpeakerSlot('tok-1', 'confirmed')).toEqual({ ok: true })
    expect(row('sp1').status).toBe('confirmed')
    expect(row('sp2').status).toBe('invited')
  })

  it('an unknown token is refused and nothing is written', async () => {
    const { confirmSpeakerSlot, declineSpeakerSlot } = await import('@/lib/speaker/speaker-actions')
    expect(await confirmSpeakerSlot('nope', 'confirmed')).toEqual({ error: 'Invitation not found' })
    expect(await declineSpeakerSlot('', 'x')).toEqual({ error: 'Invitation not found' })
    expect(await declineSpeakerSlot('tok-1', { evil: 1 } as unknown as string)).toEqual({ error: 'Invalid response' })
    expect(h.db.writesTo('speakers')).toEqual([])
  })

  it('decline records the reason on the token’s speaker only', async () => {
    const { declineSpeakerSlot } = await import('@/lib/speaker/speaker-actions')
    expect(await declineSpeakerSlot('tok-2', 'busy', 'next year')).toEqual({ ok: true })
    expect(row('sp2')).toMatchObject({ status: 'declined', decline_reason: 'busy', decline_alternative: 'next year' })
    expect(row('sp1').status).toBe('invited')
  })
})

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

  it('covers every secret column of every table', () => {
    for (const [table, cols] of Object.entries(SECRET_TOKEN_COLUMNS)) {
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

// Static guard: a user client (createClient from supabase/server or
// supabase/client) reading one of these tables must name its columns — '*',
// a bare .select() after a write, or a secret column now fails in production.
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

  it('finds none', () => {
    const hits: string[] = []
    const secret = new RegExp(`\\b(${SECRETS.join('|')})\\b`)
    for (const f of files(join(process.cwd(), 'src'))) {
      const src = readFileSync(f, 'utf-8')
      if (!/supabase\/(server|client)'/.test(src)) continue
      const re = new RegExp(`([A-Za-z_$][\\w$]*)\\s*\\.from\\(\\s*'(${TABLES.join('|')})'\\s*\\)`, 'g')
      for (const m of src.matchAll(re)) {
        if (!userVar(src, m[1], m.index!)) continue
        const rest = src.slice(m.index! + m[0].length)
        const end = rest.search(/\n\s*\n|;\s*\n|\.from\(/)
        const chain = end === -1 ? rest : rest.slice(0, end)
        const line = src.slice(0, m.index).split('\n').length
        if (/\.select\(\s*['`]\s*\*/.test(chain) || /\.select\(\s*\)/.test(chain) || secret.test(chain)) {
          hits.push(`${f.replace(process.cwd() + '/', '')}:${line}`)
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

describe('speaker confirm / decline by token', () => {
  beforeEach(() => {
    h.db = createFakeDb({
      speakers: [
        { id: 'sp1', event_id: 'e1', name: 'Ann', email: null, status: 'invited', confirmation_token: 'tok-1', events: { title: 'A', slug: 'a' } },
        { id: 'sp2', event_id: 'e1', name: 'Bob', email: null, status: 'invited', confirmation_token: 'tok-2', events: { title: 'A', slug: 'a' } },
      ],
      org_speakers: [],
    })
  })
  const row = (id: string) => h.db.tables.speakers.find((r: any) => r.id === id)

  it('confirm updates only the token’s own speaker', async () => {
    const { confirmSpeakerSlot } = await import('@/lib/speaker/speaker-actions')
    expect(await confirmSpeakerSlot('tok-1', 'confirmed')).toEqual({ error: undefined })
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
    expect(await declineSpeakerSlot('tok-2', 'busy', 'next year')).toEqual({ error: undefined })
    expect(row('sp2')).toMatchObject({ status: 'declined', decline_reason: 'busy', decline_alternative: 'next year' })
    expect(row('sp1').status).toBe('invited')
  })
})

// In-memory stand-in for a Supabase client, for authorization tests that must
// prove "nothing was written". Filters (eq/neq/in/is) are evaluated against the
// fixture rows; writes mutate the fixture and are recorded in `writes`.
// Nested selects are not resolved: put related objects on the fixture row
// (e.g. { id, event_id, events: { org_id } }).
import { vi } from 'vitest'

type Row = Record<string, any>
type Filter = (r: Row) => boolean

export type Write = { table: string; op: 'insert' | 'update' | 'delete' | 'upsert'; values?: any; matched: number }

export function createFakeDb(
  initial: Record<string, Row[]> = {},
  opts: {
    failInsert?: Record<string, { code: string; message: string }>
    // Any update/delete on the table fails with this error (inserts: failInsert).
    failWrite?: Record<string, { code: string; message: string }>
    // Evaluate PostgREST .or() filters (col.eq."v", col.ilike."v", col.in.("a","b")).
    // Off by default: existing tests rely on .or() being a no-op.
    evalOr?: boolean
    // Emulates a unique index: return true when the new row collides with an existing one (→ 23505).
    unique?: Record<string, (existing: Row, incoming: Row) => boolean>
  } = {},
) {
  const tables: Record<string, Row[]> = {}
  for (const [k, v] of Object.entries(initial)) tables[k] = v.map(r => ({ ...r }))
  const writes: Write[] = []
  const removedFiles: string[] = []

  function builder(table: string) {
    const filters: Filter[] = []
    let op: Write['op'] | 'select' = 'select'
    let values: any
    let limitN: number | null = null
    let returning = false
    let conflictCols: string[] | null = null
    const rows = () => (tables[table] ??= [])

    const b: any = {}
    const chain = (fn: Filter) => { filters.push(fn); return b }
    b.select = vi.fn(() => { if (op !== 'select') returning = true; return b })
    // 'rel.col' filters (embedded-resource filters) read the nested fixture object.
    const val = (r: Row, c: string) => c.split('.').reduce((o: any, k) => (o == null ? undefined : o[k]), r)
    b.eq = vi.fn((c: string, v: any) => chain(r => val(r, c) === v))
    b.neq = vi.fn((c: string, v: any) => chain(r => r[c] !== v))
    b.in = vi.fn((c: string, v: any[]) => chain(r => v.includes(r[c])))
    b.is = vi.fn((c: string, v: any) => chain(r => (r[c] ?? null) === v))
    b.not = vi.fn(() => b)
    b.or = vi.fn((f: string) => (opts.evalOr ? chain(orPredicate(f)) : b))
    b.ilike = vi.fn((c: string, v: string) => (opts.evalOr ? chain(r => likeEquals(r[c], v)) : b))
    b.gte = vi.fn(() => b)
    b.lte = vi.fn(() => b)
    b.order = vi.fn(() => b)
    b.range = vi.fn(() => b)
    b.limit = vi.fn((n: number) => { limitN = n; return b })
    b.insert = vi.fn((v: any) => { op = 'insert'; values = v; return b })
    b.upsert = vi.fn((v: any, o?: { onConflict?: string }) => {
      op = 'upsert'; values = v
      conflictCols = o?.onConflict ? o.onConflict.split(',').map(c => c.trim()) : null
      return b
    })
    b.update = vi.fn((v: any) => { op = 'update'; values = v; return b })
    b.delete = vi.fn(() => { op = 'delete'; return b })

    function run(): { data: any; error: any; count: number | null } {
      const matched = rows().filter(r => filters.every(f => f(r)))
      if (op === 'select') {
        const out = limitN == null ? matched : matched.slice(0, limitN)
        return { data: out, error: null, count: out.length }
      }
      if (op === 'insert' || op === 'upsert') {
        const fail = opts.failInsert?.[table]
        if (fail) return { data: null, error: fail, count: null }
        // upsert with onConflict: merge into the row that matches those columns.
        if (op === 'upsert' && conflictCols) {
          const cols = conflictCols
          const incoming = Array.isArray(values) ? values : [values]
          const merged: Row[] = []
          const fresh: Row[] = []
          for (const v of incoming as Row[]) {
            const hit = rows().find(r => cols.every(c => r[c] === v[c]))
            if (hit) { Object.assign(hit, v); merged.push(hit) } else fresh.push(v)
          }
          if (fresh.length === 0) {
            writes.push({ table, op, values, matched: merged.length })
            return { data: returning ? merged : null, error: null, count: merged.length }
          }
          if (merged.length > 0) values = fresh
        }
        const list = (Array.isArray(values) ? values : [values]).map((v: Row) => ({ id: v.id ?? `new-${rows().length + 1}`, ...v }))
        const clash = opts.unique?.[table]
        if (clash && list.some((n: Row) => rows().some(r => clash(r, n)))) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' }, count: null }
        }
        rows().push(...list)
        writes.push({ table, op, values, matched: list.length })
        return { data: returning ? list : null, error: null, count: list.length }
      }
      const failW = opts.failWrite?.[table]
      if (failW && (op === 'update' || op === 'delete')) return { data: null, error: failW, count: null }
      if (op === 'update') {
        for (const r of matched) Object.assign(r, values)
        writes.push({ table, op, values, matched: matched.length })
        return { data: returning ? matched : null, error: null, count: matched.length }
      }
      tables[table] = rows().filter(r => !matched.includes(r))
      writes.push({ table, op: 'delete', matched: matched.length })
      return { data: returning ? matched : null, error: null, count: matched.length }
    }

    b.single = vi.fn(async () => {
      const res = run()
      const list = Array.isArray(res.data) ? res.data : res.data ? [res.data] : []
      if (res.error) return res
      return list.length === 1 ? { data: list[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' } }
    })
    b.maybeSingle = vi.fn(async () => {
      const res = run()
      const list = Array.isArray(res.data) ? res.data : res.data ? [res.data] : []
      if (res.error) return res
      return { data: list[0] ?? null, error: null }
    })
    b.then = (ok: any, bad: any) => Promise.resolve().then(run).then(ok, bad)
    return b
  }

  const deletedUsers: string[] = []
  const client: any = {
    from: vi.fn((t: string) => builder(t)),
    // profiles.id cascades from auth.users: deleting the user removes the profile.
    auth: { admin: { deleteUser: vi.fn(async (id: string) => {
      deletedUsers.push(id)
      if (tables.profiles) tables.profiles = tables.profiles.filter(p => p.id !== id)
      return { data: {}, error: null }
    }) } },
    storage: { from: vi.fn(() => ({ remove: vi.fn(async (paths: string[]) => { removedFiles.push(...paths); return { error: null } }) })) },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  }
  return { client, tables, writes, removedFiles, deletedUsers, writesTo: (t: string) => writes.filter(w => w.table === t && w.matched > 0) }
}

// PostgREST .or() list → predicate. Supports the forms the GDPR code emits:
// col.eq."v", col.ilike."v" (exact, case-insensitive; \\ escapes), col.in.("a","b").
function splitTop(list: string): string[] {
  const parts: string[] = []
  let cur = '', inQuote = false, depth = 0
  for (let i = 0; i < list.length; i++) {
    const ch = list[i]
    if (ch === '\\' && inQuote) { cur += ch + list[++i]; continue }
    if (ch === '"') inQuote = !inQuote
    else if (!inQuote && ch === '(') depth++
    else if (!inQuote && ch === ')') depth--
    if (ch === ',' && !inQuote && depth === 0) { parts.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur) parts.push(cur)
  return parts
}
const unquote = (v: string) => (v.startsWith('"') ? v.slice(1, -1).replace(/\\(.)/g, '$1') : v)
function orPredicate(list: string): (r: Record<string, any>) => boolean {
  const preds = splitTop(list).map(part => {
    const m = /^([a-z_0-9]+)\.(eq|ilike|in)\.(.*)$/.exec(part)
    if (!m) throw new Error(`fake-db: unsupported .or() part ${part}`)
    const [, col, op, raw] = m
    if (op === 'in') {
      const vals = splitTop(raw.slice(1, -1)).map(unquote)
      return (r: Record<string, any>) => vals.includes(r[col])
    }
    const v = unquote(raw)
    if (op === 'eq') return (r: Record<string, any>) => r[col] === v
    return (r: Record<string, any>) => likeEquals(r[col], v)
  })
  return r => preds.some(p => p(r))
}

// Exact, case-insensitive match of an escaped LIKE pattern with no wildcards
// (\\% and \\_ are literal). A bare % or _ is not supported here.
function likeEquals(value: unknown, pattern: string): boolean {
  if (typeof value !== 'string') return false
  const literal = pattern.replace(/\\(.)/g, '$1')
  return value.toLowerCase() === literal.toLowerCase()
}

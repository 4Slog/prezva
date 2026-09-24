// In-memory stand-in for a Supabase client, for authorization tests that must
// prove "nothing was written". Filters (eq/neq/in/is) are evaluated against the
// fixture rows; writes mutate the fixture and are recorded in `writes`.
// Nested selects are not resolved: put related objects on the fixture row
// (e.g. { id, event_id, events: { org_id } }).
import { vi } from 'vitest'

type Row = Record<string, any>
type Filter = (r: Row) => boolean

export type Write = { table: string; op: 'insert' | 'update' | 'delete' | 'upsert'; values?: any; matched: number }

export function createFakeDb(initial: Record<string, Row[]> = {}, opts: { failInsert?: Record<string, { code: string; message: string }> } = {}) {
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
    const rows = () => (tables[table] ??= [])

    const b: any = {}
    const chain = (fn: Filter) => { filters.push(fn); return b }
    b.select = vi.fn(() => { if (op !== 'select') returning = true; return b })
    b.eq = vi.fn((c: string, v: any) => chain(r => r[c] === v))
    b.neq = vi.fn((c: string, v: any) => chain(r => r[c] !== v))
    b.in = vi.fn((c: string, v: any[]) => chain(r => v.includes(r[c])))
    b.is = vi.fn((c: string, v: any) => chain(r => (r[c] ?? null) === v))
    b.not = vi.fn(() => b)
    b.or = vi.fn(() => b)
    b.ilike = vi.fn(() => b)
    b.gte = vi.fn(() => b)
    b.lte = vi.fn(() => b)
    b.order = vi.fn(() => b)
    b.range = vi.fn(() => b)
    b.limit = vi.fn((n: number) => { limitN = n; return b })
    b.insert = vi.fn((v: any) => { op = 'insert'; values = v; return b })
    b.upsert = vi.fn((v: any) => { op = 'upsert'; values = v; return b })
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
        const list = (Array.isArray(values) ? values : [values]).map((v: Row) => ({ id: v.id ?? `new-${rows().length + 1}`, ...v }))
        rows().push(...list)
        writes.push({ table, op, values, matched: list.length })
        return { data: returning ? list : null, error: null, count: list.length }
      }
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

  const client: any = {
    from: vi.fn((t: string) => builder(t)),
    storage: { from: vi.fn(() => ({ remove: vi.fn(async (paths: string[]) => { removedFiles.push(...paths); return { error: null } }) })) },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  }
  return { client, tables, writes, removedFiles, writesTo: (t: string) => writes.filter(w => w.table === t && w.matched > 0) }
}

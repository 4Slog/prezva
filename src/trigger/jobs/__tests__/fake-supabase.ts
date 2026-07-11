import { vi } from 'vitest'

export type Recorded = {
  table: string
  mode: 'select' | 'update' | 'insert' | 'delete'
  filters: Record<string, any>
  orFilter?: string
  payload?: any
}

type Resolver = (call: Recorded) => { data: any; error: any } | Promise<{ data: any; error: any }>

/**
 * Minimal chainable fake for supabase-js query builders, generic enough to
 * cover the .select/.update/.insert/.eq/.in/.lte/.lt/.or/.limit/.maybeSingle
 * chains used by the trigger jobs under test. Every terminal call (single(),
 * maybeSingle(), or bare await) is recorded and handed to a per-test resolver
 * so assertions can inspect exactly what WHERE was sent.
 */
export function makeFakeAdmin(resolver: Resolver) {
  const calls: Recorded[] = []

  function builder(table: string) {
    const state: Recorded = { table, mode: 'select', filters: {} }

    const resolve = () => {
      calls.push({ ...state, filters: { ...state.filters } })
      return Promise.resolve(resolver({ ...state, filters: { ...state.filters } }))
    }

    const chain: any = {
      select() { return chain },
      update(payload: any) { state.mode = 'update'; state.payload = payload; return chain },
      insert(rows: any) { state.mode = 'insert'; state.payload = rows; return chain },
      delete() { state.mode = 'delete'; return chain },
      eq(col: string, val: any) { state.filters[col] = { eq: val }; return chain },
      in(col: string, vals: any[]) { state.filters[col] = { in: vals }; return chain },
      lte(col: string, val: any) { state.filters[col] = { lte: val }; return chain },
      lt(col: string, val: any) { state.filters[col] = { lt: val }; return chain },
      or(expr: string) { state.orFilter = expr; return chain },
      limit(n: number) { state.filters.__limit = n; return chain },
      order() { return chain },
      maybeSingle: () => resolve(),
      single: () => resolve(),
      then(onFulfilled: any, onRejected: any) {
        return resolve().then(onFulfilled, onRejected)
      },
    }
    return chain
  }

  const admin = { from: vi.fn(builder) }
  return { admin, calls }
}

/**
 * Executes the exact claimable-WHERE the production code sends via .or(),
 * against a virtual row's status/updated_at — proves the filter string is
 * correct rather than asserting it received a hardcoded expected value.
 *
 * Expected shape: "status.in.(scheduled,draft),and(status.eq.sending,updated_at.lt.<iso>)"
 */
export function evalClaimableWhere(row: { status: string; updated_at: string }, orExpr: string): boolean {
  const [inPart, andPart] = orExpr.split('),and(')
  const inMatch = inPart.match(/status\.in\.\(([^)]*)\)?$/)
  const inValues = inMatch ? inMatch[1].split(',') : []
  const inClaim = inValues.includes(row.status)

  const andMatch = andPart?.match(/^status\.eq\.(\w+),updated_at\.lt\.([^)]*)\)$/)
  const andStatus = andMatch?.[1]
  const andStaleBefore = andMatch?.[2]
  const andClaim = !!andStatus && !!andStaleBefore && row.status === andStatus && row.updated_at < andStaleBefore

  return inClaim || andClaim
}

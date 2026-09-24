import { describe, it, expect } from 'vitest'
import { quotePostgrestValue, escapeLikePattern, ilikeContains, ilikeAnyOf } from '@/lib/db/postgrest-filter'

// Minimal model of how PostgREST reads an .or() list: split on commas outside
// double quotes, then unquote the value (backslash escapes the next char).
function parseOr(filter: string): { column: string; op: string; value: string }[] {
  const parts: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < filter.length; i++) {
    const c = filter[i]
    if (inQuotes && c === '\\') { cur += c + filter[++i]; continue }
    if (c === '"') inQuotes = !inQuotes
    if (c === ',' && !inQuotes) { parts.push(cur); cur = ''; continue }
    cur += c
  }
  parts.push(cur)
  return parts.map(p => {
    const [column, op, ...rest] = p.split('.')
    const raw = rest.join('.')
    expect(raw.startsWith('"') && raw.endsWith('"')).toBe(true)
    return { column, op, value: raw.slice(1, -1).replace(/\\(.)/g, '$1') }
  })
}

describe('postgrest-filter', () => {
  it('keeps "a,b" inside a single literal match per column', () => {
    const conds = parseOr(ilikeAnyOf(['attendee_name', 'attendee_email'], 'a,b'))
    expect(conds).toEqual([
      { column: 'attendee_name', op: 'ilike', value: '%a,b%' },
      { column: 'attendee_email', op: 'ilike', value: '%a,b%' },
    ])
  })

  it('keeps "zz%,id.not.is.null" inside a single literal match (no injected condition, % literal)', () => {
    const conds = parseOr(ilikeAnyOf(['attendee_name', 'attendee_email'], 'zz%,id.not.is.null'))
    expect(conds).toHaveLength(2)
    expect(conds.every(c => c.op === 'ilike')).toBe(true)
    // After PostgREST unquoting, the LIKE pattern escapes the user's % wildcard.
    expect(conds[0].value).toBe('%zz\\%,id.not.is.null%')
  })

  it('escapes quotes and backslashes for PostgREST', () => {
    expect(quotePostgrestValue('say "hi" \\o/')).toBe('"say \\"hi\\" \\\\o/"')
    const [c] = parseOr(ilikeContains('attendee_name', 'O"Neil)'))
    expect(c.value).toBe('%O"Neil)%')
  })

  it('escapes % and _ for ilike', () => {
    expect(escapeLikePattern('50%_off\\')).toBe('50\\%\\_off\\\\')
  })
})

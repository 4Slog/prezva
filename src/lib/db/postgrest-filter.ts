// Safe building blocks for PostgREST filter strings (`.or(...)`), where a raw
// user value can otherwise inject extra conditions: `a,b` splits into two
// conditions and `zz%,id.not.is.null` appends a match-everything clause.
//
// A double-quoted PostgREST value is one literal whatever it contains (commas,
// dots, parentheses); inside the quotes only `"` and `\` need a backslash.
// ilike patterns additionally treat `%` and `_` as wildcards, so those are
// escaped (with `\`, Postgres' default LIKE escape) before quoting.

/** Double-quotes a value for use inside a PostgREST filter string. */
export function quotePostgrestValue(value: string): string {
  return `"${value.replace(/[\\"]/g, m => `\\${m}`)}"`
}

/** Escapes LIKE/ILIKE wildcards so the value matches literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, m => `\\${m}`)
}

/** `column.ilike."%<term>%"` — a literal substring match on one column. */
export function ilikeContains(column: string, term: string): string {
  return `${column}.ilike.${quotePostgrestValue(`%${escapeLikePattern(term)}%`)}`
}

/** An `.or()` argument matching the term as a literal substring of any column. */
export function ilikeAnyOf(columns: string[], term: string): string {
  return columns.map(c => ilikeContains(c, term)).join(',')
}

import type { SupabaseClient } from '@supabase/supabase-js'

export async function getSuppressedEmailSet(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from('email_suppressions').select('email')
  if (error) return new Set()
  return new Set((data ?? []).map((s: any) => (s.email as string).toLowerCase()))
}

// Fetches the whole suppression set rather than a targeted per-email query: ilike is
// unsafe for emails (the local part can contain `_`, an ilike wildcard) and PostgREST
// can't do a clean lower(email)=lower($1) filter. At current scale (~hundreds of rows)
// the full-set fetch is cheap and correct.
export async function isEmailSuppressed(supabase: SupabaseClient, email: string): Promise<boolean> {
  const suppressed = await getSuppressedEmailSet(supabase)
  return suppressed.has(email.toLowerCase())
}

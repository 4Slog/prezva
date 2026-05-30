import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Mirror of src/trigger/lib/supabase-admin.ts — same NoopWebSocket stub for Node 21 compat.
// @supabase/realtime-js >= 2.106 requires a global WebSocket that Node 21 lacks; seed scripts
// don't use Realtime, so a no-op stub satisfies the constructor without pulling in `ws`.
class NoopWebSocket {
  constructor(_address: string | URL, _subprotocols?: string | string[]) {}
}

export function createSeedClient(): SupabaseClient {
  const url = process.env.SUPABASE_PROJECT_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('Missing env: SUPABASE_PROJECT_URL (or NEXT_PUBLIC_SUPABASE_URL)')
  if (!key) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: NoopWebSocket as any },
  })
}

/** Extracts the Supabase project ref from the project URL.
 *  e.g. https://jmhxyyrleipcorvkmxfk.supabase.co → jmhxyyrleipcorvkmxfk */
export function extractProjectRef(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0]
  } catch {
    throw new Error(`Cannot parse project ref from URL: ${supabaseUrl}`)
  }
}

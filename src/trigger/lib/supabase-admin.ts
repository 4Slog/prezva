import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// @supabase/realtime-js >= 2.106 requires a global WebSocket, which Node 21
// (the current Trigger.dev default runtime) does not provide. None of our
// Trigger jobs use Realtime — they only do DB reads/writes and Storage uploads
// — so we pass a never-instantiated stub as the transport to satisfy the
// constructor's type check without depending on `ws` or bumping the runtime.
class NoopWebSocket {
  constructor(_address: string | URL, _subprotocols?: string | string[]) {}
}

export function createAdminClient(): SupabaseClient {
  // SUPABASE_PROJECT_URL points at the direct project (https://<ref>.supabase.co)
  // so storage.getPublicUrl() builds links against the real Storage host. The
  // NEXT_PUBLIC_SUPABASE_URL fallback (auth-proxy domain) is kept for backward
  // compat with environments that haven't been migrated yet.
  const supabaseUrl = process.env.SUPABASE_PROJECT_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!
  return createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: NoopWebSocket as any },
    },
  )
}

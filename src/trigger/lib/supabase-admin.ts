import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NoopWebSocket } from '@/lib/supabase/realtime-stub'

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

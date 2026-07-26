import { createClient } from '@supabase/supabase-js'
import { NoopWebSocket } from './realtime-stub'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: NoopWebSocket as any },
    }
  )
}

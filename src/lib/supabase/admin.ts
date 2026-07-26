import { createClient } from '@supabase/supabase-js'
import { NoopWebSocket } from './realtime-stub'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Missing Supabase admin credentials')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: NoopWebSocket as any },
  })
}

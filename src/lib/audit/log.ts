import { createClient } from '@/lib/supabase/server'

type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout' | 'checkin' | 'register' | 'payment' | 'export'

interface AuditEntry {
  org_id?: string
  event_id?: string
  user_id?: string
  action: AuditAction
  table_name?: string
  record_id?: string
  old_data?: Record<string, unknown>
  new_data?: Record<string, unknown>
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('audit_logs').insert(entry)
  } catch {
    // audit failures must never break the caller
  }
}

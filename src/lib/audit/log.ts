import type { SupabaseClient } from '@supabase/supabase-js'

export async function logAudit(
  supabase: SupabaseClient,
  orgId: string | null,
  userId: string | null,
  action: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      org_id: orgId,
      user_id: userId,
      action,
      table_name: entityType ?? null,
      record_id: entityId ? entityId as unknown as string : null,
      new_data: metadata ? metadata as unknown as Record<string, unknown> : null,
    })
  } catch { /* audit failures must never surface to the user */ }
}

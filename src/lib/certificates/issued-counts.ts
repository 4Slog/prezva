import type { SupabaseClient } from '@supabase/supabase-js'
import { isCertificateServable } from './servable'

export type IssuedCertificateCounts = { issued: number; void: number }

// O157: every issued certificate for the event, and how many are void because
// their registration is no longer confirmed. Callers pass a client that sees
// every registration of the event (the service role, after their own
// authorization) — an RLS-filtered join would count hidden rows as void.
export async function countIssuedCertificates(db: SupabaseClient, eventId: string): Promise<IssuedCertificateCounts | null> {
  const { data, error } = await db
    .from('issued_certificates')
    .select('id, registrations(status)')
    .eq('event_id', eventId)
  if (error) {
    console.error('[certificates] issued count failed', { eventId, error: error.message })
    return null
  }
  const rows = (data ?? []) as unknown as { registrations: { status: string | null } | null }[]
  return {
    issued: rows.length,
    void: rows.filter(r => !isCertificateServable(r.registrations?.status)).length,
  }
}

export function issuedCountLabel({ issued, void: voided }: IssuedCertificateCounts): string {
  return voided > 0
    ? `${issued} issued (${voided} void — registration cancelled or refunded)`
    : `${issued} issued`
}

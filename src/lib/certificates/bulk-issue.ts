'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { issueOrGetCertificate } from './actions'

export async function bulkIssueCertificates(eventId: string): Promise<{ issued: number; skipped: number; failed: number }> {
  const user = await requireUser()
  const admin = createAdminClient()

  const { data: event } = await admin.from('events').select('org_id').eq('id', eventId).single()
  if (!event) return { issued: 0, skipped: 0, failed: 0 }

  await assertPermission(event.org_id, user.id, 'certificates.manage')

  const { data: regs } = await admin
    .from('registrations')
    .select('id')
    .eq('event_id', eventId)
    .in('status', ['confirmed'])

  let issued = 0, skipped = 0, failed = 0
  for (const reg of (regs ?? []) as any[]) {
    const result = await issueOrGetCertificate(reg.id)
    if ('skipped' in result && result.skipped) {
      skipped++
    } else if ('error' in result && result.error) {
      failed++
    } else {
      issued++
    }
  }

  return { issued, skipped, failed }
}

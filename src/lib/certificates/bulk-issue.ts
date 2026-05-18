'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { assertOrgRole } from '@/lib/orgs/actions'
import { createClient } from '@/lib/supabase/server'
import { issueOrGetCertificate } from './actions'

export async function bulkIssueCertificates(eventId: string): Promise<{ issued: number; skipped: number; failed: number }> {
  const user = await requireUser()
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: event } = await admin.from('events').select('org_id').eq('id', eventId).single()
  if (!event) return { issued: 0, skipped: 0, failed: 0 }

  await assertOrgRole(supabase, event.org_id, user.id, ['owner', 'admin'])

  const { data: regs } = await admin
    .from('registrations')
    .select('id')
    .eq('event_id', eventId)
    .in('status', ['confirmed', 'checked_in'])

  let issued = 0, skipped = 0, failed = 0
  for (const reg of (regs ?? []) as any[]) {
    const result = await issueOrGetCertificate(reg.id)
    if (!result.error) {
      issued++
    } else if (result.error.toLowerCase().includes('eligible') || result.error.toLowerCase().includes('attendance')) {
      skipped++
    } else {
      failed++
    }
  }

  return { issued, skipped, failed }
}

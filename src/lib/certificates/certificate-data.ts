import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  issueCertificateCore,
  getOrCreateDefaultTemplate as getOrCreateDefaultTemplateCore,
} from './issue-core'

// Server-only certificate helpers. None of them authorizes the caller (see the
// issueOrGetCertificate note), so they must never be server-action exports.

// Thin re-exposure of the core helper, which lives in issue-core.ts so the
// Trigger.dev sweep can resolve templates without importing this module.
export async function getOrCreateDefaultTemplate(orgId: string): Promise<string | null> {
  return getOrCreateDefaultTemplateCore(orgId)
}

export async function getIssuedCertificate(registrationId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('issued_certificates')
    .select('*')
    .eq('registration_id', registrationId)
    .maybeSingle()
  return data
}

// The DASHBOARD door. Authorization has already happened upstream by the time
// this runs, and it is not the same check on every path:
//   • src/app/api/certificates/[regId]/route.ts — the ATTENDEE, via owner-match
//     on registrations.user_id or the registration's certificate_token.
//   • src/lib/certificates/bulk-issue.ts — the ORGANIZER, via
//     assertPermission(orgId, userId, 'certificates.manage').
// That is exactly why issueCertificateCore performs no authorization of its
// own; see the header comment there before adding a check to either side.
export async function issueOrGetCertificate(
  registrationId: string,
): Promise<{ data?: any; skipped?: true; error?: string }> {
  return issueCertificateCore(createAdminClient(), registrationId, 'dashboard')
}

export async function listOrgCertificateTemplates(orgId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('certificate_templates')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  return (data ?? []) as any[]
}

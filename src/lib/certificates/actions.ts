'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  issueCertificateCore,
  getOrCreateDefaultTemplate as getOrCreateDefaultTemplateCore,
} from './issue-core'

// Thin re-exposure of the core helper. It lives in issue-core.ts so that module
// can resolve templates without importing back into this 'use server' file and
// creating a cycle; the wrapper keeps the existing server-action export surface
// and every existing import path working unchanged.
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

export async function getMyIssuedCertificates() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: regs } = await supabase
    .from('registrations')
    .select('id')
    .eq('user_id', user.id)

  const regIds = regs?.map(r => r.id) ?? []
  if (regIds.length === 0) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('issued_certificates')
    .select('*, events(title, slug, start_at), certificate_templates(name, payload)')
    .in('registration_id', regIds)
    .order('created_at', { ascending: false })

  return (data ?? []) as any[]
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

export async function upsertCertificateTemplate(
  orgId: string,
  params: { id?: string; name: string; isDefault: boolean; payload: object }
) {
  const admin = createAdminClient()

  if (params.isDefault) {
    await admin
      .from('certificate_templates')
      .update({ is_default: false })
      .eq('org_id', orgId)
  }

  if (params.id) {
    const { error } = await admin
      .from('certificate_templates')
      .update({ name: params.name, is_default: params.isDefault, payload: params.payload, updated_at: new Date().toISOString() })
      .eq('id', params.id)
    return { error: error?.message }
  }

  const { error } = await admin
    .from('certificate_templates')
    .insert({ org_id: orgId, name: params.name, is_default: params.isDefault, payload: params.payload })
  return { error: error?.message }
}

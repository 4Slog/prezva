'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { catchPermission } from '@/lib/auth/permission-error'
import { isCertificateServable } from './servable'

export async function getMyIssuedCertificates() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: regs } = await supabase
    .from('registrations')
    .select('id, status')
    .eq('user_id', user.id)

  const regIds = regs?.map(r => r.id) ?? []
  if (regIds.length === 0) return []
  // O157: the wallet marks a certificate whose registration is no longer confirmed.
  const statusById = new Map((regs ?? []).map(r => [r.id, r.status as string | null]))

  const admin = createAdminClient()
  const { data } = await admin
    .from('issued_certificates')
    .select('*, events(title, slug, start_at), certificate_templates(name, payload)')
    .in('registration_id', regIds)
    .order('created_at', { ascending: false })

  return ((data ?? []) as any[]).map(c => ({ ...c, servable: isCertificateServable(statusById.get(c.registration_id)) }))
}

export async function upsertCertificateTemplate(
  orgId: string,
  params: { id?: string; name: string; isDefault: boolean; payload: object }
) {
  const user = await requireUser()
  try { await assertPermission(orgId, user.id, 'org.certificate_templates') } catch (e) { return catchPermission(e) }
  const admin = createAdminClient()

  // An existing template is edited only within its own org (the org checked above).
  if (params.id) {
    const { data: existing } = await admin
      .from('certificate_templates')
      .select('id, org_id')
      .eq('id', params.id)
      .maybeSingle()
    if (!existing || existing.org_id !== orgId) return { error: 'Template not found' }
  }

  if (params.isDefault) {
    await admin
      .from('certificate_templates')
      .update({ is_default: false })
      .eq('org_id', orgId)
  }

  if (params.id) {
    const { data, error } = await admin
      .from('certificate_templates')
      .update({ name: params.name, is_default: params.isDefault, payload: params.payload, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('org_id', orgId)
      .select('id')
    if (error) return { error: error.message }
    if (!data?.length) return { error: 'Template not found' }
    return { error: undefined }
  }

  const { error } = await admin
    .from('certificate_templates')
    .insert({ org_id: orgId, name: params.name, is_default: params.isDefault, payload: params.payload })
  return { error: error?.message }
}

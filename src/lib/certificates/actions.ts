'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_CERTIFICATE_TEMPLATE } from '@/lib/templates/certificates'
import { checkEligibility } from './eligibility'
import { enqueueCertificateEmail } from '@/lib/trigger'
import { logAudit } from '@/lib/audit/log'
import { createNotification } from '@/lib/notifications/notification-actions'

export async function getOrCreateDefaultTemplate(orgId: string): Promise<string | null> {
  // Admin client: template management bypasses RLS for server-side cert generation
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('certificate_templates')
    .select('id')
    .eq('org_id', orgId)
    .eq('is_default', true)
    .maybeSingle()

  if (existing) return existing.id

  const { data: created, error } = await admin
    .from('certificate_templates')
    .insert({
      org_id: orgId,
      name: DEFAULT_CERTIFICATE_TEMPLATE.name,
      is_default: true,
      payload: DEFAULT_CERTIFICATE_TEMPLATE.payload,
    })
    .select('id')
    .single()

  if (error) return null
  return created.id
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

export async function issueOrGetCertificate(registrationId: string) {
  const admin = createAdminClient()

  const existing = await getIssuedCertificate(registrationId)
  if (existing) return { data: existing }

  const eligibility = await checkEligibility(registrationId)
  if (!eligibility.eligible) {
    return { error: eligibility.reason ?? 'Not eligible' }
  }

  const { data: reg } = await admin
    .from('registrations')
    .select('event_id, user_id, attendee_name, attendee_email, events(org_id, title, slug)')
    .eq('id', registrationId)
    .maybeSingle()

  if (!reg) return { error: 'Registration not found' }

  const orgId = (reg.events as any)?.org_id
  const templateId = await getOrCreateDefaultTemplate(orgId)
  if (!templateId) return { error: 'No certificate template configured' }

  const { data: cert, error } = await admin
    .from('issued_certificates')
    .insert({
      registration_id: registrationId,
      event_id: reg.event_id,
      template_id: templateId,
      ce_credit_hours: eligibility.ceCredits,
      sessions_attended: eligibility.sessionsAttended,
    })
    .select('*')
    .single()

  if (error) return { error: error.message }

  await logAudit(admin, orgId, null, 'certificate.issue', 'issued_certificates', cert.id, { registrationId })

  // Enqueue certificate delivery email (non-blocking)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const eventSlug = (reg.events as any)?.slug ?? ''
  void enqueueCertificateEmail({
    registrationId,
    attendeeEmail:   (reg as any).attendee_email,
    attendeeName:    (reg as any).attendee_name,
    eventTitle:      (reg.events as any)?.title ?? '',
    certDownloadUrl: `${appUrl}/api/certificates/${registrationId}`,
    verifyUrl:       `${appUrl}/e/${eventSlug}/certificate?id=${cert.id}`,
    ceCredits:       eligibility.ceCredits ?? undefined,
  })

  // Create in-app notification if user has an account
  if ((reg as any).user_id) {
    void createNotification(
      (reg as any).user_id,
      'certificate',
      'Your certificate is ready',
      `Certificate for ${(reg.events as any)?.title ?? 'your event'}`,
      '/me/wallet',
    )
  }

  return { data: cert }
}

export async function getMyIssuedCertificates() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('issued_certificates')
    .select('*, events(title, slug, start_at), certificate_templates(name, payload)')
    .in('registration_id', supabase.from('registrations').select('id').eq('user_id', user.id) as any)
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

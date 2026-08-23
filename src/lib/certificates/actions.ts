'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_CERTIFICATE_TEMPLATE } from '@/lib/templates/certificates'
import { checkEligibility } from './eligibility'
import { enqueueCertificateEmail, enqueueGhlStageMove } from '@/lib/trigger'
import { logAudit } from '@/lib/audit/log'
import { createNotification } from '@/lib/notifications/notification-actions'
import { ghlLocationIdForOrg } from '@/lib/integrations/ghl/location'
import { getGhlOrgConfig, type GhlOrgConfig } from '@/lib/integrations/ghl/org-config'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { ghlPut } from '@/lib/integrations/ghl/client'
import { eventCompletionDateInEventTz } from '@/lib/ghl/event-date'
import type { SupabaseClient } from '@supabase/supabase-js'

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

// Writes the two certificate merge fields onto the attendee's GHL contact.
// Module-local and fully non-throwing on the GHL leg: a GHL failure must never
// fail certificate issuance on our side.
//
// Both writes are guarded on truthiness of their own field id, so an org
// provisioned before this batch — whose field_ids map simply lacks these keys —
// degrades to writing nothing rather than throwing. Same reason prezvaEventDate
// is absent from FIELD_KEYS in org-config.ts.
//
// A null completionDate (missing end_at or timezone) omits the field entirely
// rather than merging an empty string: the formatter returns null instead of
// guessing, and a field that was never written is recoverable, a field written
// blank looks deliberate.
async function writeCertificateMergeFields(
  admin: SupabaseClient,
  orgId: string,
  registrationId: string,
  fieldIds: GhlOrgConfig['fieldIds'],
  eventTitle: string | null,
  completionDate: string | null,
): Promise<void> {
  // Guards first, before any I/O: an org provisioned before this batch has
  // nothing to write, and should touch neither the database nor GHL.
  const customFields: Array<{ id: string; value: string }> = []
  if (eventTitle && fieldIds.prezvaEventName) {
    customFields.push({ id: fieldIds.prezvaEventName, value: eventTitle })
  }
  if (completionDate && fieldIds.prezvaCompletionDate) {
    customFields.push({ id: fieldIds.prezvaCompletionDate, value: completionDate })
  }
  if (customFields.length === 0) return

  const { data: syncState } = await admin
    .from('ghl_sync_state')
    .select('id, ghl_contact_id')
    .eq('internal_registration_id', registrationId)
    .maybeSingle()

  // No sync state or no contact means this registration never reached GHL —
  // nothing to merge into, and not an error.
  if (!syncState?.ghl_contact_id) return

  try {
    const token = await ghlAdapter.getAccessToken(orgId)
    if (!token) throw new Error(`no GHL access token for org ${orgId}`)
    await ghlPut(token, `/contacts/${syncState.ghl_contact_id}`, { customFields })
  } catch (e) {
    console.error('[certificates] certificate merge-field write failed (non-fatal):', e)
    // Record it on the ledger, not just in a server log. The GHL internal
    // notification tells the organizer to open the Prezva tab and check the
    // sync health indicator; a failure that never reaches ghl_sync_state makes
    // that instruction a dead end. Same pattern as the writeback's
    // no_ghl_access_token write.
    await admin
      .from('ghl_sync_state')
      .update({
        last_error: `cert_fields_write_failed: ${e instanceof Error ? e.message : String(e)}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', syncState.id)
  }
}

export async function issueOrGetCertificate(
  registrationId: string,
): Promise<{ data?: any; skipped?: true; error?: string }> {
  const admin = createAdminClient()

  const existing = await getIssuedCertificate(registrationId)
  if (existing) return { data: existing }

  const eligibility = await checkEligibility(registrationId)
  if (!eligibility.eligible) {
    return { skipped: true, error: eligibility.reason ?? 'Not eligible' }
  }

  const { data: reg } = await admin
    .from('registrations')
    .select('event_id, user_id, attendee_name, attendee_email, events(org_id, title, slug, end_at, timezone)')
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

  // Move the attendee's GHL opportunity to Certificate Issued.
  // The ghl-stage-move job silently skips registrations with no GHL sync state, so this is a no-op for standalone orgs.
  try {
    const locationId = await ghlLocationIdForOrg(admin, orgId)
    if (locationId) {
      const config = await getGhlOrgConfig(admin, orgId)
      if (config) {
        // ORDERING IS LOAD-BEARING. Entering the certificateIssued stage applies
        // the prezva-cert-issued tag (buildStageTagMaps, applied by
        // trigger/jobs/ghl-stage-move.ts), and that tag is what triggers the GHL
        // workflow that renders the certificate. The tag cannot be applied
        // before the job runs, and the job cannot run before the enqueue below —
        // so awaiting the write first is a structural guarantee that the merge
        // fields are set before anything reads them. No wait, no retry, no sleep.
        // R56 fixed this same class of bug one surface over.
        //
        // A failure here is NOT a no-op. Today's template holds hardcoded text,
        // so a failed write currently renders a wrong-but-populated certificate;
        // once the template merges tokens, it renders a VISIBLY EMPTY one. We
        // still let the stage move fire — a stalled pipeline with no retry path
        // strands the attendee entirely, which is worse — and the failure is
        // recorded on ghl_sync_state so it surfaces in the sync health indicator.
        //
        // The enqueue sits OUTSIDE this try/catch on purpose: it must fire even
        // if the sync-state read or the ledger write itself throws.
        try {
          await writeCertificateMergeFields(
            admin,
            orgId,
            registrationId,
            config.fieldIds,
            (reg.events as any)?.title ?? null,
            eventCompletionDateInEventTz(
              (reg.events as any)?.end_at ?? null,
              (reg.events as any)?.timezone ?? null,
            ),
          )
        } catch (e) {
          console.error('[certificates] certificate merge-field write failed (non-fatal):', e)
        }

        await enqueueGhlStageMove({ registrationId, stageId: config.stageIds.certificateIssued })
      } else {
        console.error(`[ghl] org ${orgId} is GHL-linked but has no ghl_org_config row — sync skipped`)
      }
    }
  } catch (e) {
    console.error('[certificates] enqueueGhlStageMove failed:', e)
  }

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

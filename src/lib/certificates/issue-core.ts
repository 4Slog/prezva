import { createAdminClient } from '@/lib/supabase/admin'
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

// ─────────────────────────────────────────────────────────────────────────────
// Shared certificate-issue core for BOTH issuance doors: the dashboard
// (src/lib/certificates/actions.ts) and the GHL embed
// (src/lib/embedded/certificates-actions.ts).
//
// Each door used to carry its own copy of this logic. R59 improved the
// dashboard copy and not the embed copy, and for weeks every certificate issued
// through the embed silently skipped both the GHL writeback and the attendee
// email — nobody noticed, because each door looked correct on its own. One
// function with two callers is the fix; a second copy is how the divergence
// happened in the first place.
//
// ── THIS FUNCTION PERFORMS NO AUTHORIZATION. ─────────────────────────────────
// ── EVERY CALLER MUST AUTHORIZE BEFORE CALLING IT. ───────────────────────────
//
// Do not "tidy" a permission check into this module. The callers authorize as
// DIFFERENT PRINCIPALS, and no single check is correct for all of them:
//
//   • src/app/api/certificates/[regId]/route.ts authorizes the ATTENDEE, acting
//     on their OWN registration — owner-match on registrations.user_id, or
//     bearer of that registration's certificate_token.
//   • src/lib/certificates/bulk-issue.ts authorizes the ORGANIZER —
//     assertPermission(orgId, userId, 'certificates.manage').
//   • src/lib/embedded/certificates-actions.ts authorizes the ORGANIZER via the
//     signed embed session plus an event-ownership assert.
//
// So an organizer-permission check added here would 403 an attendee
// downloading their own certificate, and an attendee-ownership check added here
// would break bulk issuance. The check belongs at each door, where the
// principal is actually known. This module only decides WHAT issuance does,
// never WHO is allowed to ask for it.
// ─────────────────────────────────────────────────────────────────────────────

export type CertificateIssueSource = 'dashboard' | 'embed'

// The merge-field write has four outcomes and only ONE of them may stamp.
// Collapsing them to a boolean is what made an earlier cut of this batch stamp
// on 'no-contact' and 'nothing-to-write'.
type MergeFieldWriteOutcome = 'written' | 'nothing-to-write' | 'no-contact' | 'failed'

// end_at and timezone are load-bearing, not incidental: they are the two inputs
// to eventCompletionDateInEventTz, and the embed's old select omitted both. A
// straight copy of the dashboard's GHL block into the embed file would have
// passed undefined/undefined, taken the formatter's null path, and quietly
// dropped the completion date from every embed-issued certificate — the same
// class of silent divergence this module exists to end.
const REGISTRATION_SELECT =
  'event_id, user_id, attendee_name, attendee_email, events(org_id, title, slug, end_at, timezone)'

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
//
// R61: the body above is unchanged from the dashboard copy this was moved from.
// The one addition is the RETURN VALUE, which the ghl_synced_at stamp needs and
// which a void function could not provide.
//
// Four outcomes rather than a boolean, because only 'written' may stamp. The
// two no-op outcomes are conditions that can later become true on their own —
// the app webhook binds ghl_contact_id, or the org gets re-provisioned with the
// certificate field ids — so stamping either would freeze a certificate in a
// state it was about to grow out of, and the merge fields would never be
// written. Leaving them unstamped is a cheap self-terminating poll: both guards
// return before the token fetch, so it costs a few reads and no PUT, and it
// stops the moment the condition it tests flips.
//
// 'failed' is the expensive one — a merge PUT that keeps failing pays a real
// token fetch and a real PUT on every call. It must not stamp either, and
// bounding its retry needs schema (an attempt counter or backoff marker):
// filed as O82, deliberately not solved here.
async function writeCertificateMergeFields(
  admin: SupabaseClient,
  orgId: string,
  registrationId: string,
  fieldIds: GhlOrgConfig['fieldIds'],
  eventTitle: string | null,
  completionDate: string | null,
): Promise<MergeFieldWriteOutcome> {
  // Guards first, before any I/O: an org provisioned before this batch has
  // nothing to write, and should touch neither the database nor GHL.
  const customFields: Array<{ id: string; value: string }> = []
  if (eventTitle && fieldIds.prezvaEventName) {
    customFields.push({ id: fieldIds.prezvaEventName, value: eventTitle })
  }
  if (completionDate && fieldIds.prezvaCompletionDate) {
    customFields.push({ id: fieldIds.prezvaCompletionDate, value: completionDate })
  }
  if (customFields.length === 0) return 'nothing-to-write'

  const { data: syncState } = await admin
    .from('ghl_sync_state')
    .select('id, ghl_contact_id')
    .eq('internal_registration_id', registrationId)
    .maybeSingle()

  // No sync state or no contact means this registration never reached GHL —
  // nothing to merge into, and not an error.
  if (!syncState?.ghl_contact_id) return 'no-contact'

  try {
    const token = await ghlAdapter.getAccessToken(orgId)
    if (!token) throw new Error(`no GHL access token for org ${orgId}`)
    await ghlPut(token, `/contacts/${syncState.ghl_contact_id}`, { customFields })
    return 'written'
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
    return 'failed'
  }
}

// The GHL half of issuance, shared by first issuance and by the repair path.
//
// Returns true ONLY on a genuine write success: the org is GHL-linked, it has a
// ghl_org_config row, the merge write actually WROTE (not merely "did not
// fail" — see MergeFieldWriteOutcome), and the stage-move enqueue completed. That return is the SOLE input to the ghl_synced_at stamp, and the
// stamp is what removes a certificate from the repair path permanently — so
// every other outcome returns false and leaves the certificate repairable. That
// is the safe direction: a missed repair costs one more pass, a wrong stamp
// costs the certificate forever.
async function runGhlCertificateSync(
  admin: SupabaseClient,
  orgId: string,
  registrationId: string,
  eventTitle: string | null,
  endAt: string | null,
  timeZone: string | null,
): Promise<boolean> {
  try {
    // The GHL-linked gate, for first issuance and repair alike. A standalone org
    // has no GHL side at all: it must reach neither the merge write nor the
    // enqueue, and must never be stamped, because there is nothing to stamp for.
    //
    // Precisely: this stops all GHL *API* work for such an org. It does not
    // make the repair branch free — an unstamped certificate at a standalone
    // org still pays a registration select and this lookup on every call, and
    // never converges, because not stamping a skipped GHL block is required.
    // Bounding that is a schema question (an attempts/skipped marker), not one
    // this gate can answer.
    const locationId = await ghlLocationIdForOrg(admin, orgId)
    if (!locationId) return false

    const config = await getGhlOrgConfig(admin, orgId)
    if (!config) {
      console.error(`[ghl] org ${orgId} is GHL-linked but has no ghl_org_config row — sync skipped`)
      return false
    }

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
    let outcome: MergeFieldWriteOutcome = 'failed'
    try {
      outcome = await writeCertificateMergeFields(
        admin,
        orgId,
        registrationId,
        config.fieldIds,
        eventTitle,
        eventCompletionDateInEventTz(endAt, timeZone),
      )
    } catch (e) {
      console.error('[certificates] certificate merge-field write failed (non-fatal):', e)
      outcome = 'failed'
    }

    const handle = await enqueueGhlStageMove({ registrationId, stageId: config.stageIds.certificateIssued })

    // enqueueGhlStageMove NEVER throws. It returns null when TRIGGER_SECRET_KEY
    // is unset, and swallows a Trigger.dev outage into a console.error plus
    // null. So "the await did not throw" is NOT evidence the stage move was
    // queued, and the stamp has to key on the handle itself.
    //
    // Without this check, a successful merge write paired with a silently
    // dropped enqueue would stamp the certificate and hide it from repair
    // forever, while the opportunity never reaches certificateIssued and the
    // prezva-cert-issued tag that renders the certificate never fires — the
    // exact failure the ghl_synced_at column comment forbids.
    return outcome === 'written' && handle !== null
  } catch (e) {
    console.error('[certificates] enqueueGhlStageMove failed:', e)
    return false
  }
}

// Stamps a GENUINE GHL success onto the certificate. Non-fatal: a failed stamp
// leaves the certificate repairable, which is the harmless direction.
// Returns the timestamp actually written, or null if the stamp did not land.
// Callers patch it onto the row they return so a caller reading ghl_synced_at
// off the result never sees the pre-repair NULL and concludes the GHL half
// still needs running.
async function stampGhlSynced(admin: SupabaseClient, certificateId: string): Promise<string | null> {
  const stampedAt = new Date().toISOString()
  const { error } = await admin
    .from('issued_certificates')
    .update({ ghl_synced_at: stampedAt })
    .eq('id', certificateId)

  if (error) {
    console.error('[certificates] ghl_synced_at stamp failed (non-fatal):', error.message)
    return null
  }
  return stampedAt
}

export async function issueCertificateCore(
  admin: SupabaseClient,
  registrationId: string,
  source: CertificateIssueSource,
): Promise<{ data?: any; skipped?: true; error?: string }> {
  const { data: existing } = await admin
    .from('issued_certificates')
    .select('*')
    .eq('registration_id', registrationId)
    .maybeSingle()

  if (existing) {
    // Already synced — return it and make ZERO GHL calls. This is the hot path:
    // the attendee download route calls this on every single PDF fetch, so a
    // stamped certificate must cost exactly one query.
    if (existing.ghl_synced_at) return { data: existing }

    // Repair. The certificate exists but its GHL half never ran or failed.
    // Every certificate ever issued through the embed door is in this state,
    // as is any dashboard certificate whose merge write failed.
    const { data: repairReg } = await admin
      .from('registrations')
      .select(REGISTRATION_SELECT)
      .eq('id', registrationId)
      .maybeSingle()

    const repairOrgId = (repairReg as any)?.events?.org_id
    // No registration or no org means there is nothing to repair against.
    // Hand back the certificate we already have rather than failing a download.
    if (!repairOrgId) return { data: existing }

    const repaired = await runGhlCertificateSync(
      admin,
      repairOrgId,
      registrationId,
      (repairReg as any)?.events?.title ?? null,
      (repairReg as any)?.events?.end_at ?? null,
      (repairReg as any)?.events?.timezone ?? null,
    )
    const repairStampedAt = repaired ? await stampGhlSynced(admin, existing.id) : null

    return { data: repairStampedAt ? { ...existing, ghl_synced_at: repairStampedAt } : existing }
  }

  const eligibility = await checkEligibility(registrationId)
  if (!eligibility.eligible) {
    return { skipped: true, error: eligibility.reason ?? 'Not eligible' }
  }

  const { data: reg } = await admin
    .from('registrations')
    .select(REGISTRATION_SELECT)
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

  await logAudit(admin, orgId, null, 'certificate.issue', 'issued_certificates', cert.id, {
    registrationId,
    via: source,
  })

  const synced = await runGhlCertificateSync(
    admin,
    orgId,
    registrationId,
    (reg.events as any)?.title ?? null,
    (reg.events as any)?.end_at ?? null,
    (reg.events as any)?.timezone ?? null,
  )
  const stampedAt = synced ? await stampGhlSynced(admin, cert.id) : null

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

  return { data: stampedAt ? { ...cert, ghl_synced_at: stampedAt } : cert }
}

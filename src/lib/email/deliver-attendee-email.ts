import type { SupabaseClient } from '@supabase/supabase-js'
import { isEventGhlLinked } from '@/lib/integrations/ghl/location'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { ghlUpsertContact, ghlSendEmail } from '@/lib/integrations/ghl/client'
import { isEmailSuppressed } from '@/lib/email/suppression'

type DeliverAttendeeEmailParams = {
  registrationId: string
  to: string
  attendeeName?: string
  subject: string
  html: string
  text?: string
  from: string
  replyTo?: string
}

type DeliverAttendeeEmailResult = {
  channel: 'ghl' | 'resend'
  suppressed?: boolean
  ghlError?: string
}

// Routes an attendee-facing email through the organizer's GHL (Pattern B —
// Prezva composes, GHL delivers) when the event is GHL-linked, falling back
// to Prezva's own Resend send on any GHL failure. Composes nothing itself —
// callers own subject/html/text.
export async function deliverAttendeeEmail(
  admin: SupabaseClient,
  params: DeliverAttendeeEmailParams,
): Promise<DeliverAttendeeEmailResult> {
  const { data: reg } = await admin
    .from('registrations')
    .select('event_id')
    .eq('id', params.registrationId)
    .maybeSingle()
  const eventId = reg?.event_id ?? null

  const { linked, orgId, locationId } = eventId
    ? await isEventGhlLinked(admin, eventId)
    : { linked: false, orgId: null, locationId: null }

  if (linked) {
    try {
      const token = await ghlAdapter.getAccessToken(orgId!)
      if (!token) throw new Error('no_token')

      const { data: syncState } = await admin
        .from('ghl_sync_state')
        .select('ghl_contact_id')
        .eq('internal_registration_id', params.registrationId)
        .maybeSingle()

      let contactId: string | null = syncState?.ghl_contact_id ?? null
      if (!contactId) {
        const name = (params.attendeeName ?? '').trim()
        const spaceIdx = name.indexOf(' ')
        const firstName = spaceIdx === -1 ? name : name.slice(0, spaceIdx)
        const lastName = spaceIdx === -1 ? '' : name.slice(spaceIdx + 1)

        contactId = await ghlUpsertContact(token, {
          firstName,
          lastName,
          email: params.to,
          locationId: locationId!,
        })

        await admin
          .from('ghl_sync_state')
          .update({ ghl_contact_id: contactId })
          .eq('internal_registration_id', params.registrationId)
      }

      await ghlSendEmail(token, {
        contactId,
        subject: params.subject,
        html: params.html,
      })

      return { channel: 'ghl' }
    } catch (err) {
      console.error('[deliver-attendee-email] GHL send failed, falling back to Resend', err)
      const resendResult = await sendViaResend(admin, params)
      return { ...resendResult, ghlError: String(err) }
    }
  }

  return sendViaResend(admin, params)
}

async function sendViaResend(
  admin: SupabaseClient,
  params: Pick<DeliverAttendeeEmailParams, 'to' | 'subject' | 'html' | 'text' | 'from' | 'replyTo'>,
): Promise<{ channel: 'resend'; suppressed?: boolean }> {
  if (await isEmailSuppressed(admin, params.to)) {
    return { channel: 'resend', suppressed: true }
  }

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: params.from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    replyTo: params.replyTo,
  })

  return { channel: 'resend' }
}

/**
 * Prezva Trigger.dev helpers
 * Import these in server actions / API routes to enqueue background jobs.
 * Never import trigger task files directly in app code — use these helpers.
 */
import { tasks } from '@trigger.dev/sdk/v3'
import type { sendConfirmationEmail, processWaitlist } from '@/trigger/jobs/registration'
import type { sendAnnouncement } from '@/trigger/jobs/announcement'
import type { sendVolunteerInviteEmail } from '@/trigger/jobs/volunteer-invite'
import type { sendCertificateEmail } from '@/trigger/jobs/certificate-email'

type ConfirmationPayload = Parameters<typeof sendConfirmationEmail.trigger>[0]
type WaitlistPayload     = Parameters<typeof processWaitlist.trigger>[0]

export async function enqueueConfirmationEmail(payload: ConfirmationPayload) {
  if (!process.env.TRIGGER_SECRET_KEY) {
    console.warn('[trigger] TRIGGER_SECRET_KEY not set — skipping email job')
    return null
  }
  try {
    const handle = await tasks.trigger<typeof sendConfirmationEmail>(
      'send-registration-confirmation',
      payload,
    )
    return handle
  } catch (err) {
    // Never let a job queue failure break the registration flow
    console.error('[trigger] Failed to enqueue confirmation email:', err)
    return null
  }
}

export async function enqueueWaitlistProcessing(payload: WaitlistPayload) {
  if (!process.env.TRIGGER_SECRET_KEY) return null
  try {
    const handle = await tasks.trigger<typeof processWaitlist>(
      'process-waitlist',
      payload,
    )
    return handle
  } catch (err) {
    console.error('[trigger] Failed to enqueue waitlist processing:', err)
    return null
  }
}

type AnnouncementPayload = Parameters<typeof sendAnnouncement.trigger>[0]

export async function enqueueAnnouncementDelivery(payload: AnnouncementPayload) {
  if (!process.env.TRIGGER_SECRET_KEY) return null
  try {
    const handle = await tasks.trigger<typeof sendAnnouncement>(
      'send-announcement',
      payload,
    )
    return handle
  } catch (err) {
    console.error('[trigger] Failed to enqueue announcement delivery:', err)
    return null
  }
}

type VolunteerInvitePayload = Parameters<typeof sendVolunteerInviteEmail.trigger>[0]

export async function sendVolunteerInvite(payload: VolunteerInvitePayload) {
  if (!process.env.TRIGGER_SECRET_KEY) {
    console.warn('[trigger] TRIGGER_SECRET_KEY not set — skipping volunteer invite')
    return null
  }
  try {
    const handle = await tasks.trigger<typeof sendVolunteerInviteEmail>(
      'send-volunteer-invite',
      payload,
    )
    return handle
  } catch (err) {
    console.error('[trigger] Failed to enqueue volunteer invite:', err)
    return null
  }
}

type CertificateEmailPayload = Parameters<typeof sendCertificateEmail.trigger>[0]

export async function enqueueCertificateEmail(payload: CertificateEmailPayload) {
  if (!process.env.TRIGGER_SECRET_KEY) return null
  try {
    const handle = await tasks.trigger<typeof sendCertificateEmail>(
      'send-certificate-email',
      payload,
    )
    return handle
  } catch (err) {
    console.error('[trigger] Failed to enqueue certificate email:', err)
    return null
  }
}

export async function enqueueSpeakerInviteEmail(payload: {
  speakerName: string
  speakerEmail: string
  eventTitle: string
  eventDate: string
  portalUrl: string
}) {
  if (!process.env.TRIGGER_SECRET_KEY) return null
  try {
    const handle = await tasks.trigger('send-speaker-invite', payload)
    return handle
  } catch (err) {
    console.error('[trigger] Failed to enqueue speaker invite email:', err)
    return null
  }
}

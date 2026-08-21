/**
 * Prezva Trigger.dev helpers
 * Import these in server actions / API routes to enqueue background jobs.
 * Never import trigger task files directly in app code — use these helpers.
 */
import { tasks } from '@trigger.dev/sdk/v3'
import type { sendConfirmationEmail, processWaitlist } from '@/trigger/jobs/registration'
import type { sendAnnouncement } from '@/trigger/jobs/announcement'
import type { sendVolunteerInviteEmail } from '@/trigger/jobs/volunteer-invite'
import type { sendVolunteerThankYouEmail } from '@/trigger/jobs/volunteer-thank-you'
import type { sendCertificateEmail } from '@/trigger/jobs/certificate-email'
import type { sendSpeakerInviteEmail } from '@/trigger/jobs/speaker-invite'
import type { ghlSyncTask } from '@/trigger/jobs/ghl-sync'
import type { ghlStageMoveTask } from '@/trigger/jobs/ghl-stage-move'
import type { ghlSpeakerMessageTask } from '@/trigger/jobs/ghl-speaker-message'

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

export async function enqueueVolunteerInvite(payload: VolunteerInvitePayload) {
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

type VolunteerThankYouPayload = Parameters<typeof sendVolunteerThankYouEmail.trigger>[0]

export async function enqueueVolunteerThankYou(payload: VolunteerThankYouPayload) {
  if (!process.env.TRIGGER_SECRET_KEY) {
    console.warn('[trigger] TRIGGER_SECRET_KEY not set — skipping volunteer thank-you')
    return null
  }
  try {
    const handle = await tasks.trigger<typeof sendVolunteerThankYouEmail>(
      'send-volunteer-thank-you',
      payload,
    )
    return handle
  } catch (err) {
    console.error('[trigger] Failed to enqueue volunteer thank-you:', err)
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

type SpeakerInvitePayload = Parameters<typeof sendSpeakerInviteEmail.trigger>[0]

export async function enqueueSpeakerInviteEmail(payload: SpeakerInvitePayload) {
  if (!process.env.TRIGGER_SECRET_KEY) return null
  try {
    const handle = await tasks.trigger<typeof sendSpeakerInviteEmail>('send-speaker-invite', payload)
    return handle
  } catch (err) {
    console.error('[trigger] Failed to enqueue speaker invite email:', err)
    return null
  }
}

type GhlSyncPayload = Parameters<typeof ghlSyncTask.trigger>[0]

/**
 * `attempt` is the sync row's `retries` count as the caller read it, and it is
 * what makes the idempotency key safe to use at all.
 *
 * Keying on the row id alone collapses the transport race — which is the point
 * — but it also swallows a legitimate re-drive: Trigger.dev returns the cached
 * run for a live key whatever that run's outcome was, so once a run has failed,
 * the second transport's enqueue would return the failed run instead of
 * starting a new one. The routes stamp `queued_for_sync` before enqueuing and
 * treat that status as already-processed, so the row would sit there forever
 * with nothing in flight. Folding `retries` in fixes that without weakening the
 * race collapse: two transports racing read the same count and share a key,
 * while a re-drive after a failure reads an incremented count and gets a fresh
 * one.
 */
export async function enqueueGhlSync(payload: GhlSyncPayload, attempt = 0) {
  if (!process.env.TRIGGER_SECRET_KEY) {
    console.warn('[trigger] TRIGGER_SECRET_KEY not set — skipping GHL sync job')
    return null
  }
  try {
    const handle = await tasks.trigger<typeof ghlSyncTask>(
      'sync-ghl-registration',
      payload,
      {
        // Both GHL webhook transports (workflow POST and Ed25519-signed app
        // webhook) fire for one order and share a single ghl_sync_state row, so
        // its id is the key both enqueues land on and the second collapses into
        // the first run instead of racing it into a duplicate opportunity POST.
        // Scoped by task name because a bare string key is global project-wide.
        idempotencyKey: `sync-ghl-registration:${payload.syncStateId}:${attempt}`,
        // Long enough to outlive any plausible gap between the two transports;
        // the attempt suffix, not the clock, is what lets a re-drive through.
        idempotencyKeyTTL: '1h',
      },
    )
    return handle
  } catch (err) {
    console.error('[trigger] Failed to enqueue GHL sync:', err)
    return null
  }
}

type GhlStageMovePayload = Parameters<typeof ghlStageMoveTask.trigger>[0]

export async function enqueueGhlStageMove(payload: GhlStageMovePayload) {
  if (!process.env.TRIGGER_SECRET_KEY) {
    console.warn('[trigger] TRIGGER_SECRET_KEY not set — skipping GHL stage move')
    return null
  }
  try {
    const handle = await tasks.trigger<typeof ghlStageMoveTask>(
      'ghl-stage-move',
      payload,
    )
    return handle
  } catch (err) {
    console.error('[trigger] Failed to enqueue GHL stage move:', err)
    return null
  }
}

type GhlSpeakerMessagePayload = Parameters<typeof ghlSpeakerMessageTask.trigger>[0]

export async function enqueueGhlSpeakerMessage(payload: GhlSpeakerMessagePayload) {
  if (!process.env.TRIGGER_SECRET_KEY) {
    console.warn('[trigger] TRIGGER_SECRET_KEY not set — skipping GHL speaker message')
    return null
  }
  try {
    const handle = await tasks.trigger<typeof ghlSpeakerMessageTask>(
      'ghl-speaker-message',
      payload,
    )
    return handle
  } catch (err) {
    console.error('[trigger] Failed to enqueue GHL speaker message:', err)
    return null
  }
}

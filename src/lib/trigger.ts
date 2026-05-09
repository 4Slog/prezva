/**
 * Prezva Trigger.dev helpers
 * Import these in server actions / API routes to enqueue background jobs.
 * Never import trigger task files directly in app code — use these helpers.
 */
import { tasks } from '@trigger.dev/sdk/v3'
import type { sendConfirmationEmail, processWaitlist } from '@/trigger/jobs/registration'

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

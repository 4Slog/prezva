import { createAdminClient } from '@/lib/supabase/admin'

// Lives apart from notification-actions.ts on purpose — do not move it back.
//
// createNotification is admin-only: it takes the target user id as an argument
// and inserts with the service-role client. Its four former neighbours in
// notification-actions.ts ('use server') are session-bound — they call
// createClient()/requireUser(), which import next/headers and next/navigation
// at module scope.
//
// That made the whole module unimportable from a Trigger.dev task. R62's
// certificate-issue sweep calls issueCertificateCore, which creates the
// in-app notification, so the sweep's bundle would have pulled next/headers
// into a plain Node runtime for the sake of one service-role INSERT that never
// needed a request context at all.
//
// Re-adding a session-bound helper to this file re-breaks the sweep, and it
// breaks it at deploy time in a bundle nobody runs locally. Session-bound
// notification code belongs in notification-actions.ts.

// Must match the CHECK on user_notifications.type (migration 0155).
export type NotificationType = 'announcement' | 'certificate' | 'video_chat_request'

// Never throws. A failed insert is logged and returned so the caller can decide;
// every current caller treats the in-app notice as best-effort.
export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body?: string,
  url?: string,
): Promise<{ error: string | null }> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('user_notifications').insert({ user_id: userId, type, title, body, url })
    if (error) {
      console.error(`[notifications] insert failed (type=${type}): ${error.message}`)
      return { error: error.message }
    }
    return { error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[notifications] insert threw (type=${type}): ${message}`)
    return { error: message }
  }
}

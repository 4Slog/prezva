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
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body?: string,
  url?: string,
) {
  const admin = createAdminClient()
  await admin.from('user_notifications').insert({ user_id: userId, type, title, body, url })
}

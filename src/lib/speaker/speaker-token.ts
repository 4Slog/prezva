import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertPermission } from '@/lib/auth/assert-permission'
import { isSpeakerLinkExpired, newSpeakerLinkToken, renewedSpeakerLinkExpiry } from '@/lib/speaker/speaker-link'

// Who is asking for a speaker portal token. A dashboard user must hold
// speakers.manage on the speaker's event's org; an embedded (GHL) session is
// authorized for exactly one org, resolved from its signed cookie upstream.
export type SpeakerTokenAuth = { userId: string } | { embedOrgId: string }

// Returns the speaker's portal token (speakers.confirmation_token — the only
// portal token since D-R3; speaker_tokens is no longer written or read).
// A live token is returned as is; an expired or missing one — or any token
// when `rotate` is set (the "Renew link" button) — is replaced with a new
// random token valid for 7 days (see speaker-link.ts for the full rule).
// The event is resolved from the speaker row, never taken from the caller,
// the caller is checked against that event's org before any token is read or
// written, and the write is filtered by that event. Throws PermissionError
// when a user lacks speakers.manage.
export async function getOrCreateSpeakerToken(
  speakerId: string,
  auth: SpeakerTokenAuth,
  opts: { rotate?: boolean } = {},
): Promise<{ token: string; eventId: string } | { error: string }> {
  const admin = createAdminClient()
  const { data: speaker } = await admin
    .from('speakers')
    .select('id, event_id, confirmation_token, portal_token_expires_at')
    .eq('id', speakerId)
    .maybeSingle()
  if (!speaker) return { error: 'Speaker not found' }
  const { data: event } = await admin
    .from('events')
    .select('id, org_id, start_at, end_at')
    .eq('id', speaker.event_id)
    .maybeSingle()
  if (!event) return { error: 'Speaker not found' }

  if ('userId' in auth) {
    await assertPermission(event.org_id, auth.userId, 'speakers.manage')
  } else if (event.org_id !== auth.embedOrgId) {
    return { error: 'Speaker not found' }
  }

  const current = speaker.confirmation_token as string | null
  if (!opts.rotate && current && !isSpeakerLinkExpired(speaker.portal_token_expires_at as string | null, event)) {
    return { token: current, eventId: event.id }
  }

  const token = newSpeakerLinkToken()
  const { data: updated, error } = await admin
    .from('speakers')
    .update({ confirmation_token: token, portal_token_expires_at: renewedSpeakerLinkExpiry() })
    .eq('id', speaker.id)
    .eq('event_id', event.id)
    .select('id')
  if (error) return { error: error.message }
  if (!updated?.length) return { error: 'Speaker not found' }
  return { token, eventId: event.id }
}

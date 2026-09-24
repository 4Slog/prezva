import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { assertPermission } from '@/lib/auth/assert-permission'

// Who is asking for a speaker portal token. A dashboard user must hold
// speakers.manage on the speaker's event's org; an embedded (GHL) session is
// authorized for exactly one org, resolved from its signed cookie upstream.
export type SpeakerTokenAuth = { userId: string } | { embedOrgId: string }

// Returns the speaker's portal token, creating or refreshing it. The event is
// resolved from the speaker row, never taken from the caller, and the caller
// is checked against that event's org before any token is read or written.
// Throws PermissionError when a user lacks speakers.manage.
export async function getOrCreateSpeakerToken(
  speakerId: string,
  auth: SpeakerTokenAuth,
): Promise<{ token: string; eventId: string } | { error: string }> {
  const admin = createAdminClient()
  const { data: speaker } = await admin.from('speakers').select('id, event_id').eq('id', speakerId).maybeSingle()
  if (!speaker) return { error: 'Speaker not found' }
  const { data: event } = await admin.from('events').select('id, org_id').eq('id', speaker.event_id).maybeSingle()
  if (!event) return { error: 'Speaker not found' }

  if ('userId' in auth) {
    await assertPermission(event.org_id, auth.userId, 'speakers.manage')
  } else if (event.org_id !== auth.embedOrgId) {
    return { error: 'Speaker not found' }
  }

  // speaker_tokens is service-role only — bearer tokens must never be exposed via RLS.
  const { data: existing } = await admin
    .from('speaker_tokens')
    .select('token, expires_at')
    .eq('event_id', event.id)
    .eq('speaker_id', speaker.id)
    .maybeSingle()
  if (existing && new Date(existing.expires_at) > new Date()) {
    return { token: existing.token as string, eventId: event.id }
  }

  const { data } = await admin
    .from('speaker_tokens')
    .upsert({ event_id: event.id, speaker_id: speaker.id }, { onConflict: 'event_id,speaker_id' })
    .select('token')
    .single()
  const token = (data as { token?: string } | null)?.token
  return token ? { token, eventId: event.id } : { error: 'Failed to generate token' }
}

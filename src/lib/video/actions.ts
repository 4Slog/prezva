'use server'

import { requireEventOrgAccess } from '@/lib/auth/require-event-access'
import { getUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { createLiveStream, deleteLiveStream } from '@/lib/video/mux'
import { createRoom, generateToken } from '@/lib/video/livekit'
import { createNotification } from '@/lib/notifications/notification-actions'

export async function enableSessionLivestream(sessionId: string, eventSlug: string) {
  let access: Awaited<ReturnType<typeof requireEventOrgAccess>>
  try {
    access = await requireEventOrgAccess(eventSlug)
  } catch {
    return { error: 'Not authorized' }
  }

  const supabase = await createClient()
  const { data: session } = await supabase
    .from('sessions')
    .select('id, mux_stream_id, mux_playback_id')
    .eq('id', sessionId)
    .eq('event_id', access.event.id)
    .maybeSingle()

  if (!session) return { error: 'Session not found' }

  if ((session as any).mux_stream_id) {
    return {
      streamId: (session as any).mux_stream_id as string,
      playbackId: (session as any).mux_playback_id as string | null,
      rtmpUrl: 'rtmps://global-live.mux.com:443/app',
      streamKey: null,
    }
  }

  let liveStream: { streamId: string; playbackId: string; rtmpUrl: string; streamKey: string }
  try {
    liveStream = await createLiveStream(sessionId)
  } catch {
    return { error: 'Failed to create Mux live stream' }
  }

  const { streamId, playbackId, rtmpUrl, streamKey } = liveStream

  const { error } = await supabase
    .from('sessions')
    .update({ mux_stream_id: streamId, mux_playback_id: playbackId } as any)
    .eq('id', sessionId)

  if (error) return { error: error.message }

  return { streamId, playbackId, rtmpUrl, streamKey }
}

export async function disableSessionLivestream(sessionId: string, eventSlug: string) {
  let access: Awaited<ReturnType<typeof requireEventOrgAccess>>
  try {
    access = await requireEventOrgAccess(eventSlug)
  } catch {
    return { error: 'Not authorized' }
  }

  const supabase = await createClient()
  const { data: session } = await supabase
    .from('sessions')
    .select('id, mux_stream_id')
    .eq('id', sessionId)
    .eq('event_id', access.event.id)
    .maybeSingle()

  if (!session || !(session as any).mux_stream_id) return { success: true }

  try {
    await deleteLiveStream((session as any).mux_stream_id as string)
  } catch {
    // stream may already be gone on Mux side — proceed with DB clear
  }

  const { error } = await supabase
    .from('sessions')
    .update({ mux_stream_id: null, mux_playback_id: null } as any)
    .eq('id', sessionId)

  if (error) return { error: error.message }

  return { success: true }
}

export async function createOneOnOneRoom(
  targetRegistrationId: string,
  eventSlug: string,
): Promise<{ error: string } | { roomToken: string; roomName: string; meetUrl: string }> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id')
    .eq('slug', eventSlug)
    .maybeSingle()
  if (!event) return { error: 'Event not found' }

  const { data: myReg } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', (event as { id: string }).id)
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .maybeSingle()
  if (!myReg) return { error: 'You must be a confirmed registrant to start a video chat' }

  const { data: targetReg } = await supabase
    .from('registrations')
    .select('id, user_id')
    .eq('id', targetRegistrationId)
    .eq('event_id', (event as { id: string }).id)
    .eq('status', 'confirmed')
    .maybeSingle()
  if (!targetReg) return { error: 'Target attendee is not a confirmed registrant' }

  // Deterministic room name — same two people always get the same room regardless of who initiates
  const roomName = `1on1-${[(myReg as { id: string }).id, (targetReg as { id: string; user_id: string | null }).id].sort().join('-')}`

  try {
    await createRoom(roomName)
  } catch (err) {
    console.error('[video] Failed to create LiveKit room:', err)
    return { error: 'Failed to create video room' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, full_name')
    .eq('id', user.id)
    .maybeSingle()
  const displayName =
    (profile as { display_name?: string; full_name?: string } | null)?.display_name ||
    (profile as { display_name?: string; full_name?: string } | null)?.full_name ||
    user.email ||
    user.id

  // Both parties are publishers in a 1-on-1
  const roomToken = await generateToken(roomName, user.id, displayName as string, true)

  // TODO: add livekit_rooms table for room persistence + audit log

  const meetUrl = `/e/${eventSlug}/meet/${roomToken}`

  const targetUserId = (targetReg as { id: string; user_id: string | null }).user_id
  if (targetUserId) {
    try {
      // Generate a separate token for the target user so the notification URL is valid for them
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('display_name, full_name')
        .eq('id', targetUserId)
        .maybeSingle()
      const targetDisplayName =
        (targetProfile as { display_name?: string; full_name?: string } | null)?.display_name ||
        (targetProfile as { display_name?: string; full_name?: string } | null)?.full_name ||
        targetUserId
      const targetToken = await generateToken(roomName, targetUserId, targetDisplayName, true)
      const targetMeetUrl = `/e/${eventSlug}/meet/${targetToken}`

      // TODO: wire web push when vapid keys confirmed
      await createNotification(
        targetUserId,
        'video_chat_request',
        'Video chat request',
        `${displayName} wants to video chat with you`,
        targetMeetUrl,
      )
    } catch (err) {
      console.error('[video] Failed to send video chat notification:', err)
      // Non-blocking — room creation succeeds regardless
    }
  }

  return { roomToken, roomName, meetUrl }
}

'use server'

import { requireEventOrgAccess } from '@/lib/auth/require-event-access'
import { createClient } from '@/lib/supabase/server'
import { createLiveStream, deleteLiveStream } from '@/lib/video/mux'

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

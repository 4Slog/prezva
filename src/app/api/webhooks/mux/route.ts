import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyWebhookSignature } from '@/lib/video/mux'
import { createSystemAnnouncement } from '@/lib/announcements/actions'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('mux-signature') ?? ''

  if (!(await verifyWebhookSignature(rawBody, signature))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: { type: string; data: Record<string, unknown> }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = createAdminClient()

  switch (event.type) {
    case 'video.live_stream.active': {
      const streamId = event.data.id as string
      const sessionId = event.data.passthrough as string | undefined

      if (sessionId) {
        await admin
          .from('sessions')
          .update({ mux_stream_id: streamId })
          .eq('id', sessionId)

        const { data: session } = await admin
          .from('sessions')
          .select('event_id')
          .eq('id', sessionId)
          .single()

        if (session?.event_id) {
          await createSystemAnnouncement(
            session.event_id,
            'Live stream is starting',
            'The virtual session is now live. Join now to watch.',
          )
        }
      }
      break
    }

    case 'video.live_stream.idle': {
      console.log('[mux webhook] live_stream.idle', event.data.id)
      break
    }

    case 'video.asset.ready': {
      const assetData = event.data as Record<string, unknown>
      const sessionId = assetData.passthrough as string | undefined

      if (sessionId) {
        const { data: session } = await admin
          .from('sessions')
          .select('id, event_id')
          .eq('id', sessionId)
          .single()

        if (session) {
          const durationSeconds = typeof assetData.duration === 'number'
            ? Math.round(assetData.duration)
            : null

          // TODO: viewer-to-registration matching will be implemented in the LivePlayer
          // component (the player will pass registration_id as metadata when starting
          // playback). For now registration_id is null and the row is a no-op placeholder.
          await admin
            .from('session_attendance')
            .upsert(
              {
                session_id: session.id,
                event_id: session.event_id,
                registration_id: null,
                watch_duration_seconds: durationSeconds,
                source: 'virtual',
              },
              { onConflict: 'session_id,registration_id', ignoreDuplicates: false },
            )
        }
      }
      break
    }

    default:
      break
  }

  return NextResponse.json({ received: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyWebhookSignature, deleteAsset, requestStaticRendition } from '@/lib/video/mux'
import { createSystemAnnouncement } from '@/lib/announcements/system'

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

      if (!sessionId) break

      const { data: session } = await admin
        .from('sessions')
        .select('id, recording_enabled, event_id')
        .eq('id', sessionId)
        .single()

      if (!session) break

      if (!(session as any).recording_enabled) {
        console.log('[mux webhook] recording_enabled=false, deleting asset', assetData.id)
        try { await deleteAsset(assetData.id as string) } catch { /* asset may not exist */ }
        break
      }

      // recording_enabled = true — save asset IDs and kick off MP4 rendition
      const playbackIds = assetData.playback_ids as Array<{ id: string }> | undefined
      const playbackId = playbackIds?.[0]?.id ?? null

      await admin
        .from('sessions')
        .update({
          mux_asset_id: assetData.id as string,
          mux_asset_playback_id: playbackId,
        } as any)
        .eq('id', sessionId)

      if (assetData.id) {
        try { await requestStaticRendition(assetData.id as string) } catch { /* non-fatal */ }
      }

      console.log('[mux webhook] recording saved, static rendition requested', sessionId)
      break
    }

    case 'video.asset.static_renditions.ready': {
      const assetId = event.data.id as string
      const { data: session } = await admin
        .from('sessions')
        .select('id')
        .eq('mux_asset_id', assetId)
        .maybeSingle()
      if (session) {
        console.log('[mux webhook] static rendition ready for session', session.id)
      }
      break
    }

    default:
      break
  }

  return NextResponse.json({ received: true })
}

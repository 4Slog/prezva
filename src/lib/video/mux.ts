import Mux from '@mux/mux-node'
import * as crypto from 'crypto'

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
})

export async function createLiveStream(sessionId: string) {
  const stream = await mux.video.liveStreams.create({
    latency_mode: 'standard',
    reconnect_window: 60,
    passthrough: sessionId,
    new_asset_settings: { playback_policy: ['public'] },
    playback_policy: ['public'],
  })
  const playbackId = stream.playback_ids?.[0]?.id ?? ''
  return {
    streamId: stream.id,
    playbackId,
    rtmpUrl: 'rtmps://global-live.mux.com:443/app',
    streamKey: stream.stream_key ?? '',
  }
}

export async function deleteLiveStream(streamId: string) {
  await mux.video.liveStreams.delete(streamId)
}

export function getPlaybackUrl(playbackId: string) {
  return `https://stream.mux.com/${playbackId}.m3u8`
}

export async function verifyWebhookSignature(rawBody: string, signature: string): Promise<boolean> {
  const secret = process.env.MUX_WEBHOOK_SECRET
  if (!secret) return false
  try {
    await mux.webhooks.verifySignature(rawBody, { 'mux-signature': signature }, secret)
    return true
  } catch {
    return false
  }
}

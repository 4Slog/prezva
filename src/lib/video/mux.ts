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

export async function deleteAsset(assetId: string): Promise<void> {
  await mux.video.assets.delete(assetId)
}

export async function requestStaticRendition(assetId: string): Promise<void> {
  await mux.video.assets.createStaticRendition(assetId, { resolution: 'highest' })
}

export async function getStaticRenditionUrl(assetId: string): Promise<string | null> {
  const asset = await mux.video.assets.retrieve(assetId)
  const sr = (asset as any).static_renditions
  if (sr?.status !== 'ready' || !sr.files?.length) return null
  const file = (sr.files as Array<{ name?: string }>).find(f => f.name === 'highest.mp4') ?? sr.files[0]
  if (!file?.name) return null
  const playbackId = asset.playback_ids?.[0]?.id
  if (!playbackId) return null
  return `https://stream.mux.com/${playbackId}/downloads/${file.name}`
}

export async function createDirectUpload(): Promise<{ uploadId: string; uploadUrl: string }> {
  const upload = await mux.video.uploads.create({
    cors_origin: process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app',
    new_asset_settings: { playback_policy: ['public'] },
  })
  if (!upload.url) throw new Error('Mux did not return an upload URL')
  return { uploadId: upload.id, uploadUrl: upload.url }
}

export async function getAssetFromUpload(uploadId: string): Promise<{ assetId: string; playbackId: string } | null> {
  const upload = await mux.video.uploads.retrieve(uploadId)
  if (!upload.asset_id) return null
  const asset = await mux.video.assets.retrieve(upload.asset_id)
  const playbackId = asset.playback_ids?.[0]?.id
  if (!playbackId) return null
  return { assetId: upload.asset_id, playbackId }
}

export async function createAssetFromUrl(url: string): Promise<{ assetId: string; playbackId: string }> {
  const asset = await mux.video.assets.create({
    inputs: [{ url }],
    playback_policy: ['public'],
  })
  const playbackId = asset.playback_ids?.[0]?.id ?? ''
  return { assetId: asset.id, playbackId }
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

import { notFound } from 'next/navigation'
import { requireEventOrgAccess } from '@/lib/auth/require-event-access'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import LivestreamSection from './LivestreamSection'
import RecordingSection from './RecordingSection'

type Props = { params: Promise<{ slug: string; sessionId: string }> }

export default async function SessionSettingsPage({ params }: Props) {
  const { slug, sessionId } = await params

  let access: Awaited<ReturnType<typeof requireEventOrgAccess>>
  try {
    access = await requireEventOrgAccess(slug)
  } catch {
    notFound()
  }

  const supabase = await createClient()
  const { data: session } = await supabase
    .from('sessions')
    .select('id, title, mux_stream_id, mux_playback_id, recording_enabled, allow_rewatch, mux_asset_id, mux_asset_playback_id, simulive_scheduled_at')
    .eq('id', sessionId)
    .eq('event_id', access!.event.id)
    .maybeSingle()

  if (!session) notFound()

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/events/${slug}`} className="text-[var(--pz-muted)] hover:text-[var(--pz-muted)] text-sm">
          ← {access!.event.title}
        </Link>
        <span className="text-[var(--pz-border)]">/</span>
        <span className="text-sm text-[var(--pz-muted)]">{session.title}</span>
        <span className="text-[var(--pz-border)]">/</span>
        <span className="text-sm text-[var(--pz-text)]">Settings</span>
      </div>

      <h1 className="text-xl font-bold text-[var(--pz-text)] mb-6">Session settings</h1>

      <LivestreamSection
        sessionId={session.id}
        eventSlug={slug}
        initialMuxStreamId={(session as any).mux_stream_id ?? null}
        initialMuxPlaybackId={(session as any).mux_playback_id ?? null}
      />
      <RecordingSection
        sessionId={session.id}
        eventSlug={slug}
        initialRecordingEnabled={(session as any).recording_enabled ?? false}
        initialAllowRewatch={(session as any).allow_rewatch ?? false}
        initialMuxAssetId={(session as any).mux_asset_id ?? null}
        initialMuxAssetPlaybackId={(session as any).mux_asset_playback_id ?? null}
        initialSimuliveScheduledAt={(session as any).simulive_scheduled_at ?? null}
        hasMuxStream={!!((session as any).mux_stream_id)}
      />
    </div>
  )
}

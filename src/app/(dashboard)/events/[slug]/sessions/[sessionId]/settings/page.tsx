import { notFound } from 'next/navigation'
import { requireEventOrgAccess } from '@/lib/auth/require-event-access'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import LivestreamSection from './LivestreamSection'

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
    .select('id, title, mux_stream_id, mux_playback_id')
    .eq('id', sessionId)
    .eq('event_id', access!.event.id)
    .maybeSingle()

  if (!session) notFound()

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/events/${slug}`} className="text-[#64748B] hover:text-[#94A3B8] text-sm">
          ← {access!.event.title}
        </Link>
        <span className="text-[#1E3A5F]">/</span>
        <span className="text-sm text-[#94A3B8]">{session.title}</span>
        <span className="text-[#1E3A5F]">/</span>
        <span className="text-sm text-[#F0F4F8]">Settings</span>
      </div>

      <h1 className="text-xl font-bold text-[#F0F4F8] mb-6">Session settings</h1>

      <LivestreamSection
        sessionId={session.id}
        eventSlug={slug}
        initialMuxStreamId={(session as any).mux_stream_id ?? null}
        initialMuxPlaybackId={(session as any).mux_playback_id ?? null}
      />
    </div>
  )
}

import { notFound } from 'next/navigation'
import { getEventBySlug } from '@/lib/events/actions'
import { getRunOfShow } from '@/lib/events/run-of-show-actions'
import { createClient } from '@/lib/supabase/server'
import { RunOfShowClient } from './run-of-show-client'

type Props = { params: Promise<{ slug: string }> }

export default async function RunOfShowPage({ params }: Props) {
  const { slug } = await params
  const event = await getEventBySlug(slug)
  if (!event) notFound()

  const eventId = (event as any).id

  const supabase = await createClient()
  const [rosItems, sessionsRes] = await Promise.all([
    getRunOfShow(eventId),
    supabase
      .from('sessions')
      .select('id, title, starts_at, ends_at, session_speakers(speakers(name))')
      .eq('event_id', eventId)
      .order('starts_at', { ascending: true }),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#F0F4F8]">Run of Show</h1>
        <p className="text-sm text-[#94A3B8] mt-1">{event.title}</p>
      </div>
      <RunOfShowClient
        eventId={eventId}
        initItems={rosItems}
        sessions={(sessionsRes.data ?? []) as any[]}
      />
    </div>
  )
}

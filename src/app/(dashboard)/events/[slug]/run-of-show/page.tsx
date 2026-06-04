import { requireEventOrgAccess } from '@/lib/auth/require-event-access'
import { getRunOfShow } from '@/lib/events/run-of-show-actions'
import { createClient } from '@/lib/supabase/server'
import { RunOfShowClient } from './run-of-show-client'

type Props = { params: Promise<{ slug: string }> }

export default async function RunOfShowPage({ params }: Props) {
  const { slug } = await params
  const { event } = await requireEventOrgAccess(slug)

  const supabase = await createClient()
  const [rosItems, sessionsRes] = await Promise.all([
    getRunOfShow(event.id),
    supabase
      .from('sessions')
      .select('id, title, starts_at, ends_at, session_speakers(speakers(name))')
      .eq('event_id', event.id)
      .order('starts_at', { ascending: true }),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--pz-text)]">Run of Show</h1>
        <p className="text-sm text-[var(--pz-muted)] mt-1">{event.title}</p>
      </div>
      <RunOfShowClient
        eventId={event.id}
        initItems={rosItems}
        sessions={(sessionsRes.data ?? []) as any[]}
      />
    </div>
  )
}

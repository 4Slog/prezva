import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { EmptyState } from '@/components/ui/EmptyState'

export const metadata = { title: 'Agenda — Prezva' }

export default async function AgendaPage() {
  await requireUser()
  const supabase = await createClient()

  const { data: events } = await supabase
    .from('events')
    .select('id, title, slug, start_at')
    .order('start_at', { ascending: false })
    .limit(20)

  if (!events || events.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--pz-text)' }}>Agenda</h1>
        <EmptyState
          icon="📋"
          title="No events yet"
          description="Create an event to start building its agenda."
          actionLabel="Create event"
          actionHref="/events/new"
        />
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--pz-text)' }}>Agenda</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--pz-muted)' }}>
        Select an event to manage its agenda and sessions.
      </p>

      <div className="grid gap-3">
        {events.map((event) => (
          <a
            key={event.id}
            href={`/events/${event.slug}/agenda`}
            className="pz-card flex items-center justify-between p-4 hover:border-[rgba(0,191,166,0.4)] transition-colors"
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--pz-text)' }}>{event.title}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--pz-muted)' }}>
                {new Date(event.start_at).toLocaleDateString()}
              </p>
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--pz-teal)' }}>View →</span>
          </a>
        ))}
      </div>
    </div>
  )
}

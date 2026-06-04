import Link from 'next/link'
import { EventStatusBadge } from './EventStatusBadge'

interface EventCardProps {
  event: {
    id: string
    title: string
    slug: string
    status: string
    event_type: string
    start_at: string
    end_at: string
    registration_count: number
    checked_in_count: number
    venue_city: string | null
    venue_state: string | null
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

const TYPE_ICON: Record<string, string> = {
  in_person: '📍',
  virtual:   '💻',
  hybrid:    '🔀',
}

export function EventCard({ event }: EventCardProps) {
  return (
    <Link href={`/events/${event.slug}`} className="block">
      <div className="pz-card p-5 hover:border-[var(--pz-teal)]/40 transition-colors cursor-pointer">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-semibold text-[var(--pz-text)] text-base leading-snug flex-1">
            {event.title}
          </h3>
          <EventStatusBadge status={event.status} />
        </div>

        <div className="flex items-center gap-3 text-xs text-[var(--pz-muted)] mb-4">
          <span>{TYPE_ICON[event.event_type] ?? '📅'}</span>
          <span>{formatDate(event.start_at)}</span>
          {(event.venue_city || event.venue_state) && (
            <>
              <span className="opacity-40">·</span>
              <span>{[event.venue_city, event.venue_state].filter(Boolean).join(', ')}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-lg font-bold text-[var(--pz-text)]">{event.registration_count}</p>
            <p className="text-xs text-[var(--pz-muted)]">Registered</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-[var(--pz-teal-ink)]">{event.checked_in_count}</p>
            <p className="text-xs text-[var(--pz-muted)]">Checked In</p>
          </div>
          {event.registration_count > 0 && (
            <div className="flex-1">
              <div className="h-1.5 rounded-full bg-[var(--pz-surface-2)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--pz-teal)]"
                  style={{ width: `${Math.min(100, (event.checked_in_count / event.registration_count) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-[var(--pz-muted)] mt-1">
                {Math.round((event.checked_in_count / event.registration_count) * 100)}% checked in
              </p>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

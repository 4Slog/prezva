'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CheckInStats } from '@/lib/checkin/actions'

interface TicketType {
  id: string
  name: string
}

interface CheckInDashboardProps {
  stats: CheckInStats
  eventId: string
  ticketTypes?: TicketType[]
  ticketFilter?: string | null
  onFilterChange?: (id: string | null) => void
  onRefresh: () => void
  onRealtimeUpdate?: () => void
}

export function CheckInDashboard({
  stats,
  eventId,
  ticketTypes = [],
  ticketFilter = null,
  onFilterChange,
  onRefresh,
  onRealtimeUpdate,
}: CheckInDashboardProps) {
  const { total_registered, total_checked_in, percent, recent } = stats
  const handlerRef = useRef(onRealtimeUpdate)
  useEffect(() => { handlerRef.current = onRealtimeUpdate })

  // T-073: Real-time check-in sync across stations
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`checkin:${eventId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'check_ins', filter: `event_id=eq.${eventId}` },
        () => { handlerRef.current?.() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [eventId])

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[var(--pz-surface)] border border-[var(--pz-border)] rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-[var(--pz-teal)]">{total_checked_in}</p>
          <p className="text-xs text-[var(--pz-muted)] mt-1">Checked In</p>
        </div>
        <div className="bg-[var(--pz-surface)] border border-[var(--pz-border)] rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-[var(--pz-text)]">{total_registered}</p>
          <p className="text-xs text-[var(--pz-muted)] mt-1">Registered</p>
        </div>
        <div className="bg-[var(--pz-surface)] border border-[var(--pz-border)] rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-[var(--pz-text)]">{percent}%</p>
          <p className="text-xs text-[var(--pz-muted)] mt-1">Attendance</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-[var(--pz-muted)]">
          <span>Check-in progress</span>
          <span>{total_checked_in}/{total_registered}</span>
        </div>
        <div className="h-2 bg-[var(--pz-surface-2)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--pz-teal)] transition-all duration-500 rounded-full"
            style={{ width: percent + '%' }}
          />
        </div>
      </div>

      {/* T-074: Ticket type filter */}
      {ticketTypes.length > 0 && onFilterChange && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onFilterChange(null)}
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{
              background: ticketFilter === null ? 'var(--pz-teal)' : 'var(--pz-surface-2)',
              color: ticketFilter === null ? '#0D1B2A' : 'var(--pz-muted)',
            }}
          >
            All tickets
          </button>
          {ticketTypes.map(tt => (
            <button
              key={tt.id}
              onClick={() => onFilterChange(tt.id)}
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{
                background: ticketFilter === tt.id ? 'var(--pz-teal)' : 'var(--pz-surface-2)',
                color: ticketFilter === tt.id ? '#0D1B2A' : 'var(--pz-muted)',
              }}
            >
              {tt.name}
            </button>
          ))}
        </div>
      )}

      {/* Recent activity */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--pz-text)]">Recent Check-Ins</h3>
          <button onClick={onRefresh} className="text-xs text-[var(--pz-teal)] hover:opacity-80">
            Refresh
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-[var(--pz-muted)] py-4 text-center">No check-ins yet</p>
        ) : (
          <div className="divide-y divide-[var(--pz-border)] rounded-lg border border-[var(--pz-border)] overflow-hidden">
            {recent.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 bg-[var(--pz-surface)]">
                <div>
                  <p className="text-sm font-medium text-[var(--pz-text)]">{c.attendee_name}</p>
                  <p className="text-xs text-[var(--pz-muted)]">{c.ticket_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--pz-muted)]">
                    {new Date(c.checked_in_at).toLocaleTimeString()}
                  </p>
                  <p className="text-xs text-[var(--pz-muted)] capitalize">
                    {c.method.replace(/_/g, ' ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

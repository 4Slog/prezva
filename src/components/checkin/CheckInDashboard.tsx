'use client'

import type { CheckInStats } from '@/lib/checkin/actions'

interface CheckInDashboardProps {
  stats: CheckInStats
  onRefresh: () => void
}

export function CheckInDashboard({ stats, onRefresh }: CheckInDashboardProps) {
  const { total_registered, total_checked_in, percent, recent } = stats

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-[var(--brand-teal)]">{total_checked_in}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Checked In</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-[var(--text-primary)]">{total_registered}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Registered</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-[var(--text-primary)]">{percent}%</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Attendance</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-[var(--text-muted)]">
          <span>Check-in progress</span>
          <span>{total_checked_in}/{total_registered}</span>
        </div>
        <div className="h-2 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--brand-teal)] transition-all duration-500 rounded-full"
            style={{ width: percent + '%' }}
          />
        </div>
      </div>

      {/* Recent activity */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Recent Check-Ins</h3>
          <button
            onClick={onRefresh}
            className="text-xs text-[var(--brand-teal)] hover:opacity-80"
          >
            Refresh
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-4 text-center">No check-ins yet</p>
        ) : (
          <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] overflow-hidden">
            {recent.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-card)]">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{c.attendee_name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{c.ticket_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--text-muted)]">
                    {new Date(c.checked_in_at).toLocaleTimeString()}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] capitalize">
                    {c.method.replace('_', ' ')}
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

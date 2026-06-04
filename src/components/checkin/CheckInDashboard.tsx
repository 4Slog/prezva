'use client'

import type { CheckInStats } from '@/lib/checkin/actions'

interface VolunteerStatus {
  total: number
  checked_in: number
  clocked_in_names: string[]
}

interface CheckInDashboardProps {
  stats: CheckInStats
  onRefresh: () => void
  volunteerStatus?: VolunteerStatus | null
}

export function CheckInDashboard({ stats, onRefresh, volunteerStatus }: CheckInDashboardProps) {
  const { total_registered, total_checked_in, percent, recent } = stats

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
        <div className="h-2 bg-[var(--pz-bg)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--pz-teal)] transition-all duration-500 rounded-full"
            style={{ width: percent + '%' }}
          />
        </div>
      </div>

      {/* Volunteer status */}
      {volunteerStatus && volunteerStatus.total > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--pz-text)]">Volunteer Status</h3>
          <div className="rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface)] p-3">
            <p className="text-sm text-[var(--pz-muted)]">
              <span className="font-semibold text-[var(--pz-teal)]">{volunteerStatus.checked_in}</span>
              {' '}of{' '}
              <span className="font-semibold text-[var(--pz-text)]">{volunteerStatus.total}</span>
              {' '}volunteers clocked in
            </p>
            {volunteerStatus.clocked_in_names.length > 0 && (
              <p className="text-xs text-[var(--pz-muted)] mt-1">
                {volunteerStatus.clocked_in_names.join(', ')}
              </p>
            )}
            {volunteerStatus.total > volunteerStatus.checked_in && (
              <p className="text-xs text-amber-400 mt-1">
                {volunteerStatus.total - volunteerStatus.checked_in} volunteer{volunteerStatus.total - volunteerStatus.checked_in !== 1 ? 's' : ''} not yet checked in
              </p>
            )}
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--pz-text)]">Recent Check-Ins</h3>
          <button
            onClick={onRefresh}
            className="text-xs text-[var(--pz-teal)] hover:opacity-80"
          >
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

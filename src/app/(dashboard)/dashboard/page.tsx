import { requireUser } from '@/lib/auth/get-user'

export default async function DashboardPage() {
  const user = await requireUser()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>
          Organizer Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--pz-muted)' }}>
          Welcome back, {user.email}
        </p>
      </div>

      {/* Stat cards — placeholder until Events module */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
        {[
          { label: 'Registered',       value: '—',  },
          { label: 'Checked In',       value: '—',  },
          { label: 'Active Sessions',  value: '—',  },
          { label: 'System Health',    value: '100%'},
        ].map((s) => (
          <div key={s.label} className="pz-card p-4">
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--pz-muted)' }}>
              {s.label}
            </p>
            <p className="text-3xl font-bold" style={{ color: 'var(--pz-text)' }}>
              {s.value}
            </p>
            <div className="pz-stat-bar" />
          </div>
        ))}
      </div>

      {/* Empty state — events module coming */}
      <div className="pz-card p-8 text-center">
        <p className="text-lg font-semibold mb-2" style={{ color: 'var(--pz-text)' }}>
          No events yet
        </p>
        <p className="text-sm mb-4" style={{ color: 'var(--pz-muted)' }}>
          Create an organization first, then add your first event.
        </p>
        <a
          href="/orgs/new"
          className="inline-block rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          Create organization
        </a>
      </div>
    </div>
  )
}

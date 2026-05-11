import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'

export const metadata = { title: 'Dashboard — Prezva' }

async function getDashboardStats(userId: string) {
  const supabase = await createClient()

  const { data: orgMembers } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)

  if (!orgMembers || orgMembers.length === 0) {
    return { registered: 0, checkedIn: 0, activeSessions: 0 }
  }

  const orgIds = orgMembers.map((m) => m.org_id)

  const { data: events } = await supabase
    .from('events')
    .select('id')
    .in('org_id', orgIds)

  if (!events || events.length === 0) {
    return { registered: 0, checkedIn: 0, activeSessions: 0 }
  }

  const eventIds = events.map((e) => e.id)
  const now = new Date().toISOString()

  const [{ count: registered }, { count: checkedIn }, { count: activeSessions }] = await Promise.all([
    supabase
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .in('event_id', eventIds)
      .eq('status', 'confirmed'),
    supabase
      .from('check_ins')
      .select('*', { count: 'exact', head: true })
      .in('event_id', eventIds),
    supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .in('event_id', eventIds)
      .lte('start_at', now)
      .gte('end_at', now),
  ])

  return {
    registered: registered ?? 0,
    checkedIn: checkedIn ?? 0,
    activeSessions: activeSessions ?? 0,
  }
}

export default async function DashboardPage() {
  const user = await requireUser()
  const stats = await getDashboardStats(user.id)

  const statCards = [
    { label: 'Registered',      value: stats.registered.toString()     },
    { label: 'Checked In',      value: stats.checkedIn.toString()      },
    { label: 'Active Sessions', value: stats.activeSessions.toString() },
    { label: 'System Health',   value: '100%'                          },
  ]

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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
        {statCards.map((s) => (
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

      <div className="pz-card p-8 text-center">
        <p className="text-lg font-semibold mb-2" style={{ color: 'var(--pz-text)' }}>
          {stats.registered === 0 ? 'No events yet' : 'Your events'}
        </p>
        <p className="text-sm mb-4" style={{ color: 'var(--pz-muted)' }}>
          {stats.registered === 0
            ? 'Create an organization first, then add your first event.'
            : 'Manage your events from the Events section.'}
        </p>
        <a
          href={stats.registered === 0 ? '/orgs/new' : '/events'}
          className="inline-block rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          {stats.registered === 0 ? 'Create organization' : 'View events'}
        </a>
      </div>
    </div>
  )
}

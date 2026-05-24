import { getPlatformStats, getRecentOrgs, getRecentEvents } from '@/lib/admin/platform-actions'
import type { PlatformStats } from '@/lib/admin/platform-actions'

export default async function AdminDashboard() {
  let stats: PlatformStats | null = null
  let recentOrgs: any[] = []
  let recentEvents: any[] = []
  let error: string | null = null

  try {
    ;[stats, recentOrgs, recentEvents] = await Promise.all([
      getPlatformStats(),
      getRecentOrgs(5),
      getRecentEvents(5),
    ])
  } catch (e: any) {
    error = e.message
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', maxWidth: 900 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--pz-text)' }}>Platform Admin</h1>
        <p style={{ color: '#EF4444' }}>{error === 'Not authorized' ? 'Access denied. Super admin only.' : error}</p>
      </div>
    )
  }

  if (!stats) return null

  const missingVars: string[] = []
  if (!process.env.RESEND_API_KEY) missingVars.push('RESEND_API_KEY')
  if (!process.env.STRIPE_SECRET_KEY) missingVars.push('STRIPE_SECRET_KEY')
  if (!process.env.STRIPE_WEBHOOK_SECRET) missingVars.push('STRIPE_WEBHOOK_SECRET')
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) missingVars.push('NEXT_PUBLIC_VAPID_PUBLIC_KEY')
  if (!process.env.VAPID_PRIVATE_KEY) missingVars.push('VAPID_PRIVATE_KEY')
  if (!process.env.INTEGRATION_ENCRYPTION_KEY) missingVars.push('INTEGRATION_ENCRYPTION_KEY')
  if (!process.env.TRIGGER_SECRET_KEY) missingVars.push('TRIGGER_SECRET_KEY')

  const statCards = [
    { label: 'Organizations', value: stats.totalOrgs, sub: `+${stats.newOrgsLast30d} last 30d`, color: 'var(--pz-teal)' },
    { label: 'Total Events', value: stats.totalEvents, sub: `${stats.activeEvents} live now`, color: '#3B82F6' },
    { label: 'Registrations', value: stats.totalRegistrations.toLocaleString(), sub: `+${stats.newRegsLast30d} last 30d`, color: '#8B5CF6' },
    { label: 'Platform Revenue', value: `$${(stats.totalRevenueCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, sub: 'all time', color: '#22C55E' },
    { label: 'Published Events', value: stats.publishedEvents, sub: 'awaiting go-live', color: '#F59E0B' },
    { label: 'Avg Regs / Event', value: stats.avgRegsPerEvent, sub: 'across all events', color: 'var(--pz-muted)' },
  ]

  return (
    <div style={{ padding: '2rem', maxWidth: 1000 }}>
      {missingVars.length > 0 && (
        <div style={{ border: '1px solid #EF4444', borderRadius: 10, padding: '1rem 1.25rem', background: '#FEF2F2', marginBottom: '1.5rem' }}>
          <p style={{ fontWeight: 700, color: '#DC2626', fontSize: 14, margin: '0 0 8px' }}>
            {missingVars.length} production env var{missingVars.length > 1 ? 's' : ''} missing
          </p>
          {missingVars.map(v => (
            <p key={v} style={{ fontSize: 13, color: '#DC2626', margin: '2px 0', fontFamily: 'monospace' }}>{v}</p>
          ))}
        </div>
      )}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--pz-text)', margin: 0 }}>
          Platform Health
        </h1>
        <p style={{ color: 'var(--pz-muted)', fontSize: 13, margin: '4px 0 0' }}>
          Super admin view — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: '2rem' }}>
        {statCards.map(({ label, value, sub, color }) => (
          <div key={label} style={{ background: 'var(--pz-surface)', borderRadius: 12,
                                     padding: '1.25rem', border: '1px solid var(--pz-border)' }}>
            <p style={{ fontSize: 28, fontWeight: 800, color, margin: '0 0 4px' }}>{value}</p>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>{label}</p>
            <p style={{ fontSize: 11, color: 'var(--pz-muted)', margin: '2px 0 0' }}>{sub}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div style={{ background: 'var(--pz-surface)', borderRadius: 12, padding: '1.25rem',
                      border: '1px solid var(--pz-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--pz-text)', margin: 0 }}>Recent orgs</p>
            <a href="/admin/orgs" style={{ fontSize: 12, color: 'var(--pz-teal)', textDecoration: 'none' }}>View all →</a>
          </div>
          {recentOrgs.map(org => (
            <div key={org.id} style={{ display: 'flex', justifyContent: 'space-between',
                                       padding: '6px 0', borderBottom: '1px solid var(--pz-border)' }}>
              <span style={{ fontSize: 13, color: 'var(--pz-text)' }}>{org.name}</span>
              <span style={{ fontSize: 11, color: 'var(--pz-muted)' }}>
                {new Date(org.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--pz-surface)', borderRadius: 12, padding: '1.25rem',
                      border: '1px solid var(--pz-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--pz-text)', margin: 0 }}>Recent events</p>
            <a href="/admin/events" style={{ fontSize: 12, color: 'var(--pz-teal)', textDecoration: 'none' }}>View all →</a>
          </div>
          {recentEvents.map(event => (
            <div key={event.id} style={{ display: 'flex', justifyContent: 'space-between',
                                          padding: '6px 0', borderBottom: '1px solid var(--pz-border)' }}>
              <div>
                <span style={{ fontSize: 13, color: 'var(--pz-text)' }}>{event.title}</span>
                <span style={{ fontSize: 11, color: 'var(--pz-muted)', marginLeft: 6 }}>
                  {(event.organizations as any)?.name}
                </span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600,
                             color: event.status === 'live' ? 'var(--pz-teal)' : 'var(--pz-muted)' }}>
                {event.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { label: 'All Organizations', href: '/admin/orgs' },
          { label: 'All Events', href: '/admin/events' },
          { label: 'Revenue', href: '/admin/revenue' },
          { label: 'Audit Log', href: '/admin/audit' },
        ].map(({ label, href }) => (
          <a key={href} href={href}
            style={{ padding: '0.5rem 1rem', borderRadius: 8, fontSize: 13, fontWeight: 600,
                     border: '1px solid var(--pz-border)', color: 'var(--pz-text)',
                     textDecoration: 'none' }}>
            {label}
          </a>
        ))}
      </div>
    </div>
  )
}

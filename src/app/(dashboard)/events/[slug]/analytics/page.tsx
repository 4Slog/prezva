import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { getEventAnalytics } from '@/lib/analytics/actions'

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.25rem 1.5rem', background: 'var(--pz-surface)' }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: '1.75rem', fontWeight: 800, color: color ?? 'var(--pz-text)', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: 'var(--pz-muted)', marginTop: 4 }}>{sub}</p>}
    </div>
  )
}

function MiniBar({ label, count, max, revenue }: { label: string; count: number; max: number; revenue?: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span style={{ color: 'var(--pz-muted)' }}>{count} tickets{revenue ? ` · $${(revenue / 100).toFixed(2)}` : ''}</span>
      </div>
      <div style={{ height: 6, background: 'var(--pz-border)', borderRadius: 4 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--pz-teal)', borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

export default async function AnalyticsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await requireUser()
  const supabase = await createClient()
  const { data: event } = await supabase.from('events').select('id,title').eq('slug', slug).single()
  if (!event) notFound()

  const stats = await getEventAnalytics(event.id)
  const revenue = (stats.totalRevenueCents / 100).toFixed(2)
  const maxTickets = Math.max(...stats.ticketBreakdown.map((t: { count: number }) => t.count), 1)

  return (
    <div style={{ padding: '2rem', maxWidth: 960 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{event.title} — Analytics</h1>
        <p style={{ color: 'var(--pz-muted)', fontSize: 14, marginTop: 4 }}>Real-time event performance overview</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: '2rem' }}>
        <StatCard label="Total Registrations" value={stats.totalRegistrations} />
        <StatCard label="Confirmed" value={stats.confirmedRegistrations} color="var(--pz-teal)" />
        <StatCard label="Checked In" value={stats.checkedIn} sub={`${stats.checkInRate}% check-in rate`} color="#7c3aed" />
        <StatCard label="Revenue" value={`$${revenue}`} color="#059669" />
        {stats.capacity && <StatCard label="Capacity" value={`${stats.capacityUsed}/${stats.capacity}`} sub={`${Math.round((stats.capacityUsed / stats.capacity) * 100)}% full`} />}
        <StatCard label="Announcements" value={stats.announcementCount} />
        <StatCard label="Survey Responses" value={stats.surveyResponseCount} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.25rem', background: 'var(--pz-surface)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: '1rem' }}>Registrations by Day</h2>
          {stats.registrationsByDay.length === 0 ? (
            <p style={{ color: 'var(--pz-muted)', fontSize: 13 }}>No registrations yet.</p>
          ) : (() => {
            const maxDay = Math.max(...stats.registrationsByDay.map((d: { count: number }) => d.count), 1)
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stats.registrationsByDay.slice(-7).map((d: { date: string; count: number }) => (
                  <div key={d.date}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ color: 'var(--pz-muted)' }}>{d.date}</span>
                      <span style={{ fontWeight: 600 }}>{d.count}</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--pz-border)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${Math.round((d.count / maxDay) * 100)}%`, background: 'var(--pz-teal)', borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        <div style={{ border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.25rem', background: 'var(--pz-surface)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: '1rem' }}>Ticket Breakdown</h2>
          {stats.ticketBreakdown.length === 0 ? (
            <p style={{ color: 'var(--pz-muted)', fontSize: 13 }}>No ticket types configured.</p>
          ) : stats.ticketBreakdown.map((t: { type: string; count: number; revenueCents: number }) => (
            <MiniBar key={t.type} label={t.type} count={t.count} max={maxTickets} revenue={t.revenueCents} />
          ))}
        </div>
      </div>
    </div>
  )
}

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { embedGetEventAnalytics } from '@/lib/embedded/analytics-actions'

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '1.25rem 1.5rem', background: 'var(--color-surface)' }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: '1.75rem', fontWeight: 800, color: color ?? 'var(--color-text)', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>{sub}</p>}
    </div>
  )
}

function MiniBar({ label, count, max, revenue }: { label: string; count: number; max: number; revenue?: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span style={{ color: 'var(--color-text-muted)' }}>{count} tickets{revenue ? ` · $${(revenue / 100).toFixed(2)}` : ''}</span>
      </div>
      <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 4 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--color-teal)', borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedAnalyticsPage({ params }: Props) {
  const { eventId } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  let orgId: string
  try {
    const session = await verifyEmbeddedSession(token)
    const db = createAdminClient()
    const { data: link } = await db
      .from('ghl_location_links')
      .select('org_id')
      .eq('ghl_location_id', session.location_id)
      .maybeSingle()
    if (!link) redirect('/embedded/events')
    orgId = link.org_id
  } catch {
    redirect('/embedded/events')
  }

  const db = createAdminClient()
  const { data: event } = await db
    .from('events')
    .select('id, status')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!event) redirect('/embedded/events')

  const analytics = await embedGetEventAnalytics(eventId)
  const revenue = (analytics.totalRevenueCents / 100).toFixed(2)
  const maxTickets = Math.max(...analytics.ticketBreakdown.map((t: { count: number }) => t.count), 1)

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pz-text)' }}>Analytics</h1>
        <p style={{ color: 'var(--pz-muted)', fontSize: 14, marginTop: 4 }}>Real-time event performance overview</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: '2rem' }}>
        <StatCard label="Total Registrations" value={analytics.totalRegistrations} />
        <StatCard label="Confirmed" value={analytics.confirmedRegistrations} color="var(--color-teal)" />
        <StatCard label="Checked In" value={analytics.checkedIn} sub={`${analytics.checkInRate}% check-in rate`} color="#7c3aed" />
        <StatCard label="Revenue" value={`$${revenue}`} color="var(--pz-success)" />
        {analytics.capacity && <StatCard label="Capacity" value={`${analytics.capacityUsed}/${analytics.capacity}`} sub={`${Math.round((analytics.capacityUsed / analytics.capacity) * 100)}% full`} />}
        <StatCard label="Announcements" value={analytics.announcementCount} />
        <StatCard label="Survey Responses" value={analytics.surveyResponseCount} />
        {(analytics.virtualAttendees > 0 || analytics.inPersonAttendees > 0) && (
          <StatCard label="Attendance Mode" value={`${analytics.inPersonAttendees} in-person`} sub={`${analytics.virtualAttendees} virtual`} color="#0891b2" />
        )}
      </div>

      {/* Registration pace */}
      {analytics.registrationsLast24h > 0 && (
        <div style={{ background: 'var(--pz-surface)', borderRadius: 12, padding: '1.25rem',
                      border: '1px solid var(--pz-border)', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-text)', margin: '0 0 8px' }}>
            Registration pace
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--pz-teal)', margin: 0 }}>
                +{analytics.registrationsLast24h}
              </p>
              <p style={{ fontSize: 11, color: 'var(--pz-muted)', margin: 0 }}>last 24 hours</p>
            </div>
            <div>
              <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--pz-teal)', margin: 0 }}>
                +{analytics.registrationsLast7d}
              </p>
              <p style={{ fontSize: 11, color: 'var(--pz-muted)', margin: 0 }}>last 7 days</p>
            </div>
          </div>
          {/* Sparkline — simple bar chart of last 14 days */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40, marginTop: 12 }}>
            {analytics.registrationsByDay.map(({ date, count }) => {
              const max = Math.max(...analytics.registrationsByDay.map(d => d.count), 1)
              return (
                <div key={date} title={`${date}: ${count}`}
                  style={{ flex: 1, background: 'var(--pz-teal)',
                           height: `${Math.max(4, (count / max) * 100)}%`,
                           borderRadius: 2, opacity: 0.7 }} />
              )
            })}
          </div>
        </div>
      )}

      {/* Check-in velocity — live events only */}
      {event.status === 'live' && analytics.checkInsLast30min > 0 && (
        <div style={{ background: 'var(--pz-surface)', borderRadius: 12, padding: '1.25rem',
                      border: '1px solid var(--pz-teal)', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-teal)', margin: '0 0 8px' }}>
            🔴 Live check-in velocity
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--pz-text)', margin: 0 }}>
                {analytics.checkInsLast30min}
              </p>
              <p style={{ fontSize: 11, color: 'var(--pz-muted)', margin: 0 }}>last 30 min</p>
            </div>
            <div>
              <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--pz-text)', margin: 0 }}>
                {analytics.checkInsLast60min}
              </p>
              <p style={{ fontSize: 11, color: 'var(--pz-muted)', margin: 0 }}>last 60 min</p>
            </div>
            {analytics.estimatedMinutesToComplete !== null && (
              <div>
                <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--pz-warning-fill)', margin: 0 }}>
                  ~{analytics.estimatedMinutesToComplete}m
                </p>
                <p style={{ fontSize: 11, color: 'var(--pz-muted)', margin: 0 }}>est. to complete</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Revenue intelligence */}
      {analytics.totalRevenueCents > 0 && (
        <div style={{ background: 'var(--pz-surface)', borderRadius: 12, padding: '1.25rem',
                      border: '1px solid var(--pz-border)', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-text)', margin: '0 0 8px' }}>
            Revenue breakdown
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Paid tickets', value: analytics.paidTicketCount },
              { label: 'Free tickets', value: analytics.freeTicketCount },
              { label: 'Comped', value: analytics.compTicketCount },
              { label: 'Avg ticket value', value: `$${(analytics.averageTicketValueCents / 100).toFixed(2)}` },
            ].map(({ label, value }) => (
              <div key={label}>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>{value}</p>
                <p style={{ fontSize: 11, color: 'var(--pz-muted)', margin: 0 }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {analytics.sessionPopularity.length > 0 && (
        <div style={{ background: 'var(--pz-surface)', borderRadius: 12, padding: '1.25rem',
                      border: '1px solid var(--pz-border)', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-text)', margin: '0 0 12px' }}>
            Session insights
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Session', 'Attendees', 'Feedback', 'Avg Rating'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Session' ? 'left' : 'center',
                                       padding: '4px 8px', color: 'var(--pz-muted)',
                                       fontWeight: 600, fontSize: 11,
                                       textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analytics.sessionPopularity.map(s => (
                <tr key={s.session_id} style={{ borderTop: '1px solid var(--pz-border)' }}>
                  <td style={{ padding: '8px 8px', color: 'var(--pz-text)', maxWidth: 200,
                               overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.title}
                  </td>
                  <td style={{ textAlign: 'center', padding: '8px 8px', color: 'var(--pz-text)' }}>
                    {s.attendee_count}
                  </td>
                  <td style={{ textAlign: 'center', padding: '8px 8px', color: 'var(--pz-text)' }}>
                    {s.feedback_count}
                  </td>
                  <td style={{ textAlign: 'center', padding: '8px 8px',
                               color: s.avg_rating >= 4 ? 'var(--pz-success-fill)' : s.avg_rating >= 3 ? 'var(--pz-teal)' : 'var(--pz-warning-fill)' }}>
                    {s.avg_rating > 0 ? `${s.avg_rating} ⭐` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '1.25rem', background: 'var(--color-surface)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: '1rem' }}>Registrations by Day (last 14 days)</h2>
          {analytics.registrationsByDay.every(d => d.count === 0) ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No registrations in the last 14 days.</p>
          ) : (() => {
            const maxDay = Math.max(...analytics.registrationsByDay.map((d: { count: number }) => d.count), 1)
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {analytics.registrationsByDay.filter(d => d.count > 0).slice(-7).map((d: { date: string; count: number }) => (
                  <div key={d.date}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>{d.date}</span>
                      <span style={{ fontWeight: 600 }}>{d.count}</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--color-border)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${Math.round((d.count / maxDay) * 100)}%`, background: 'var(--color-teal)', borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '1.25rem', background: 'var(--color-surface)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: '1rem' }}>Ticket Breakdown</h2>
          {analytics.ticketBreakdown.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No ticket types configured.</p>
          ) : analytics.ticketBreakdown.map((t: { type: string; count: number; revenueCents: number }) => (
            <MiniBar key={t.type} label={t.type} count={t.count} max={maxTickets} revenue={t.revenueCents} />
          ))}
        </div>
      </div>
    </div>
  )
}

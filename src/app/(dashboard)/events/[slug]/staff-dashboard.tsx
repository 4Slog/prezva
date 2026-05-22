'use client'

export function StaffDashboard({
  event,
  checkedInCount,
  registrationCount,
  todaysSessions,
}: {
  event: { slug: string; title: string }
  checkedInCount: number
  registrationCount: number
  todaysSessions: { id: string; title: string; starts_at: string; rooms: { name: string } | null }[] | null
}) {
  const slug = event.slug
  const remaining = registrationCount - checkedInCount
  const pct = registrationCount > 0 ? Math.round((checkedInCount / registrationCount) * 100) : 0

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '1.5rem' }}>
      <h1 style={{ fontWeight: 800, fontSize: '1.5rem', marginBottom: 4 }}>{event.title}</h1>
      <p style={{ color: 'var(--pz-muted)', fontSize: 13, marginBottom: '1.5rem' }}>Staff view</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: '1.5rem' }}>
        {[
          { label: 'Checked In', value: checkedInCount, color: 'var(--pz-teal)' },
          { label: 'Remaining', value: remaining, color: '#F59E0B' },
          { label: 'Total Regs', value: registrationCount, color: 'var(--pz-text)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--pz-surface)', borderRadius: 10,
                                     padding: '1rem', border: '1px solid var(--pz-border)', textAlign: 'center' }}>
            <p style={{ fontSize: 28, fontWeight: 800, color, margin: 0 }}>{value ?? 0}</p>
            <p style={{ fontSize: 11, color: 'var(--pz-muted)', margin: 0 }}>{label}</p>
          </div>
        ))}
      </div>

      <div style={{ height: 8, background: 'var(--pz-surface)', borderRadius: 4,
                    marginBottom: '1.5rem', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--pz-teal)',
                      borderRadius: 4, transition: 'width 0.3s' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1.5rem' }}>
        {[
          { label: 'Check-in Scanner', href: `/events/${slug}/checkin` },
          { label: 'Attendees', href: `/events/${slug}/attendees` },
          { label: 'Agenda', href: `/events/${slug}/agenda` },
          { label: 'Volunteers', href: `/events/${slug}/volunteers` },
        ].map(({ label, href }) => (
          <a key={href} href={href}
            style={{ display: 'block', padding: '0.875rem', background: 'var(--pz-surface)',
                     borderRadius: 10, border: '1px solid var(--pz-border)', textDecoration: 'none',
                     color: 'var(--pz-text)', fontSize: 14, fontWeight: 600, textAlign: 'center' }}>
            {label}
          </a>
        ))}
      </div>

      {todaysSessions && todaysSessions.length > 0 && (
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-muted)',
                       marginBottom: 10, textTransform: 'uppercase' as const }}>
            Today&apos;s Sessions
          </h2>
          {todaysSessions.map((s) => (
            <div key={s.id} style={{ padding: '0.75rem', background: 'var(--pz-surface)',
                                      borderRadius: 8, marginBottom: 6,
                                      border: '1px solid var(--pz-border)' }}>
              <p style={{ fontWeight: 600, fontSize: 14, margin: '0 0 2px' }}>{s.title}</p>
              <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: 0 }}>
                {new Date(s.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                {s.rooms?.name ? ` · ${s.rooms.name}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

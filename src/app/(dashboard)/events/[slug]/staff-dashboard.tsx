'use client'

interface CueItem {
  id: string
  title: string
  time_at: string
  duration_minutes: number
  responsible_person?: string | null
  status: string
}

export function StaffDashboard({
  event,
  checkedInCount,
  registrationCount,
  todaysSessions,
  currentCue,
  nextCue,
}: {
  event: { slug: string; title: string; timezone?: string }
  checkedInCount: number
  registrationCount: number
  todaysSessions: { id: string; title: string; starts_at: string; rooms: { name: string } | null }[] | null
  currentCue?: CueItem | null
  nextCue?: CueItem | null
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
          { label: 'Remaining', value: remaining, color: 'var(--pz-warning-fill)' },
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

      {(currentCue || nextCue) && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-muted)',
                       marginBottom: 10, textTransform: 'uppercase' as const }}>
            Current Cue
          </h2>
          {currentCue ? (
            <div style={{ padding: '0.875rem', background: 'var(--pz-surface)', borderRadius: 10,
                          border: '1px solid var(--pz-teal)', marginBottom: 8 }}>
              <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--pz-teal)', margin: '0 0 4px' }}>
                ▶ {currentCue.title}
              </p>
              {currentCue.responsible_person && (
                <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: '0 0 4px' }}>
                  → {currentCue.responsible_person}
                </p>
              )}
              <p style={{ fontSize: 11, color: 'var(--pz-muted)', margin: 0 }}>
                Started at {new Date(currentCue.time_at).toLocaleTimeString('en-US', { timeZone: event.timezone ?? 'UTC', hour: 'numeric', minute: '2-digit' })} · {currentCue.duration_minutes}m
              </p>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--pz-muted)', marginBottom: 8 }}>No item currently in progress.</p>
          )}
          {nextCue && (
            <div style={{ padding: '0.75rem', background: 'var(--pz-surface)', borderRadius: 10,
                          border: '1px solid var(--pz-border)' }}>
              <p style={{ fontSize: 11, color: 'var(--pz-muted)', margin: '0 0 2px', textTransform: 'uppercase' as const }}>Up next</p>
              <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--pz-text)', margin: 0 }}>
                {nextCue.title}
              </p>
              <p style={{ fontSize: 11, color: 'var(--pz-muted)', margin: 0 }}>
                {new Date(nextCue.time_at).toLocaleTimeString('en-US', { timeZone: event.timezone ?? 'UTC', hour: 'numeric', minute: '2-digit' })} · {nextCue.duration_minutes}m
              </p>
            </div>
          )}
        </div>
      )}

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
                {new Date(s.starts_at).toLocaleTimeString('en-US', { timeZone: event.timezone ?? 'UTC', hour: 'numeric', minute: '2-digit' })}
                {s.rooms?.name ? ` · ${s.rooms.name}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useState, use } from 'react'

export default function LobbyDisplay({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch(`/api/lobby/${token}`)
      if (cancelled) return
      if (res.ok) setData(await res.json())
      else setData({ error: true })
    }
    load()
    const interval = setInterval(load, 30000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [token])

  if (!data) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: 'var(--pz-chrome)' }}>
      <p style={{ color: 'var(--pz-teal)', fontSize: 20 }}>Loading…</p>
    </div>
  )

  if (data.error) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: 'var(--pz-chrome)' }}>
      <p style={{ color: 'var(--pz-error)', fontSize: 18 }}>Invalid display token</p>
    </div>
  )

  const checkedInPct = data.registrationCount > 0
    ? Math.round((data.checkedInCount / data.registrationCount) * 100) : 0

  return (
    <div style={{ height: '100vh', background: 'var(--pz-chrome)', color: 'var(--pz-chrome-text)',
                  display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  fontFamily: 'system-ui, sans-serif', position: 'relative' }}>
      {/* Top bar */}
      <div style={{ background: 'var(--pz-chrome-elevated)', padding: '1.5rem 3rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: '2px solid var(--pz-teal)' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, margin: 0, color: 'var(--pz-chrome-text)' }}>
            {data.eventTitle}
          </h1>
          {data.orgName && (
            <p style={{ fontSize: 14, color: 'var(--pz-chrome-muted)', margin: '4px 0 0' }}>{data.orgName}</p>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 48, fontWeight: 900, color: 'var(--pz-teal)', margin: 0, lineHeight: 1 }}>
            {data.checkedInCount}
          </p>
          <p style={{ fontSize: 14, color: 'var(--pz-chrome-muted)', margin: '4px 0 0' }}>
            of {data.registrationCount} checked in ({checkedInPct}%)
          </p>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr',
                    gap: '2rem', padding: '2rem 3rem', overflow: 'hidden' }}>

        {/* Upcoming sessions */}
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-chrome-muted)',
                       textTransform: 'uppercase', letterSpacing: '0.1em',
                       margin: '0 0 1rem' }}>
            Coming up
          </h2>
          {(data.upcomingSessions ?? []).slice(0, 4).map((s: any) => (
            <div key={s.id} style={{ marginBottom: '1rem', padding: '1rem',
                                      background: 'var(--pz-chrome-elevated)', borderRadius: 12,
                                      borderLeft: '4px solid var(--pz-teal)' }}>
              <p style={{ fontWeight: 700, fontSize: 18, margin: '0 0 4px' }}>{s.title}</p>
              <p style={{ fontSize: 14, color: 'var(--pz-chrome-muted)', margin: 0 }}>
                {new Date(s.starts_at).toLocaleTimeString('en-US', { timeZone: data.timezone ?? 'UTC', hour: 'numeric', minute: '2-digit' })}
                {(s.rooms as any)?.name ? ` · ${(s.rooms as any).name}` : ''}
              </p>
            </div>
          ))}
          {(data.upcomingSessions ?? []).length === 0 && (
            <p style={{ color: 'var(--pz-chrome-muted)', fontSize: 16 }}>No upcoming sessions</p>
          )}
        </div>

        {/* Leaderboard */}
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-chrome-muted)',
                       textTransform: 'uppercase', letterSpacing: '0.1em',
                       margin: '0 0 1rem' }}>
            Leaderboard
          </h2>
          {(data.leaderboard ?? []).slice(0, 5).map((entry: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12,
                                   marginBottom: '0.75rem', padding: '0.75rem',
                                   background: 'var(--pz-chrome-elevated)', borderRadius: 10 }}>
              <span style={{ fontSize: 24, fontWeight: 900,
                             color: i === 0 ? 'var(--pz-warning-fill)' : i === 1 ? 'var(--pz-chrome-muted)' : i === 2 ? '#CD7F32' : 'var(--pz-chrome-muted)',
                             minWidth: 32 }}>
                {i + 1}
              </span>
              <span style={{ flex: 1, fontSize: 18, fontWeight: 600 }}>
                {entry.name ?? 'Attendee'}
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--pz-teal)' }}>
                {entry.points} pts
              </span>
            </div>
          ))}
          {(data.leaderboard ?? []).length === 0 && (
            <p style={{ color: 'var(--pz-chrome-muted)', fontSize: 16 }}>No leaderboard data yet</p>
          )}
        </div>
      </div>

      {/* Sponsors bar */}
      {(data.sponsors ?? []).length > 0 && (
        <div style={{ background: 'var(--pz-chrome-elevated)', padding: '1rem 3rem', borderTop: '1px solid var(--pz-chrome-line)',
                      display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--pz-chrome-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.1em',
                      flexShrink: 0, margin: 0 }}>
            Sponsors
          </p>
          {(data.sponsors as any[]).map((s: any) => (
            s.logo_url
              ? <img key={s.id} src={s.logo_url} alt={s.name}
                  style={{ height: 36, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.7 }} />
              : <span key={s.id} style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-chrome-muted)' }}>{s.name}</span>
          ))}
        </div>
      )}

      {/* Auto-refresh indicator */}
      <div style={{ position: 'absolute', bottom: 8, right: 12,
                    fontSize: 10, color: 'var(--pz-chrome-line)' }}>
        Auto-refreshes every 30s
      </div>
    </div>
  )
}

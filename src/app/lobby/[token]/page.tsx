'use client'
import { useEffect, useState, useCallback, use } from 'react'

export default function LobbyDisplay({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<any>(null)
  const [tick, setTick] = useState(0)

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/lobby/${token}`)
    if (res.ok) setData(await res.json())
    else setData({ error: true })
  }, [token])

  useEffect(() => {
    fetchData()
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  useEffect(() => {
    if (tick > 0) fetchData()
  }, [tick, fetchData])

  if (!data) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: '#0D1B2A' }}>
      <p style={{ color: '#2DD4BF', fontSize: 20 }}>Loading…</p>
    </div>
  )

  if (data.error) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: '#0D1B2A' }}>
      <p style={{ color: '#EF4444', fontSize: 18 }}>Invalid display token</p>
    </div>
  )

  const checkedInPct = data.registrationCount > 0
    ? Math.round((data.checkedInCount / data.registrationCount) * 100) : 0

  return (
    <div style={{ height: '100vh', background: '#0D1B2A', color: '#F0F4F8',
                  display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  fontFamily: 'system-ui, sans-serif', position: 'relative' }}>
      {/* Top bar */}
      <div style={{ background: '#1E3A5F', padding: '1.5rem 3rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: '2px solid #2DD4BF' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, margin: 0, color: '#F0F4F8' }}>
            {data.eventTitle}
          </h1>
          {data.orgName && (
            <p style={{ fontSize: 14, color: '#94A3B8', margin: '4px 0 0' }}>{data.orgName}</p>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 48, fontWeight: 900, color: '#2DD4BF', margin: 0, lineHeight: 1 }}>
            {data.checkedInCount}
          </p>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: '4px 0 0' }}>
            of {data.registrationCount} checked in ({checkedInPct}%)
          </p>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr',
                    gap: '2rem', padding: '2rem 3rem', overflow: 'hidden' }}>

        {/* Upcoming sessions */}
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#64748B',
                       textTransform: 'uppercase', letterSpacing: '0.1em',
                       margin: '0 0 1rem' }}>
            Coming up
          </h2>
          {(data.upcomingSessions ?? []).slice(0, 4).map((s: any) => (
            <div key={s.id} style={{ marginBottom: '1rem', padding: '1rem',
                                      background: '#1E3A5F', borderRadius: 12,
                                      borderLeft: '4px solid #2DD4BF' }}>
              <p style={{ fontWeight: 700, fontSize: 18, margin: '0 0 4px' }}>{s.title}</p>
              <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>
                {new Date(s.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                {(s.rooms as any)?.name ? ` · ${(s.rooms as any).name}` : ''}
              </p>
            </div>
          ))}
          {(data.upcomingSessions ?? []).length === 0 && (
            <p style={{ color: '#64748B', fontSize: 16 }}>No upcoming sessions</p>
          )}
        </div>

        {/* Leaderboard */}
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#64748B',
                       textTransform: 'uppercase', letterSpacing: '0.1em',
                       margin: '0 0 1rem' }}>
            Leaderboard
          </h2>
          {(data.leaderboard ?? []).slice(0, 5).map((entry: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12,
                                   marginBottom: '0.75rem', padding: '0.75rem',
                                   background: '#1E3A5F', borderRadius: 10 }}>
              <span style={{ fontSize: 24, fontWeight: 900,
                             color: i === 0 ? '#F59E0B' : i === 1 ? '#94A3B8' : i === 2 ? '#CD7F32' : '#64748B',
                             minWidth: 32 }}>
                {i + 1}
              </span>
              <span style={{ flex: 1, fontSize: 18, fontWeight: 600 }}>
                {entry.name ?? 'Attendee'}
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#2DD4BF' }}>
                {entry.points} pts
              </span>
            </div>
          ))}
          {(data.leaderboard ?? []).length === 0 && (
            <p style={{ color: '#64748B', fontSize: 16 }}>No leaderboard data yet</p>
          )}
        </div>
      </div>

      {/* Sponsors bar */}
      {(data.sponsors ?? []).length > 0 && (
        <div style={{ background: '#1E3A5F', padding: '1rem 3rem', borderTop: '1px solid #334155',
                      display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#64748B',
                      textTransform: 'uppercase', letterSpacing: '0.1em',
                      flexShrink: 0, margin: 0 }}>
            Sponsors
          </p>
          {(data.sponsors as any[]).map((s: any) => (
            s.logo_url
              ? <img key={s.id} src={s.logo_url} alt={s.name}
                  style={{ height: 36, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.7 }} />
              : <span key={s.id} style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8' }}>{s.name}</span>
          ))}
        </div>
      )}

      {/* Auto-refresh indicator */}
      <div style={{ position: 'absolute', bottom: 8, right: 12,
                    fontSize: 10, color: '#334155' }}>
        Auto-refreshes every 30s
      </div>
    </div>
  )
}

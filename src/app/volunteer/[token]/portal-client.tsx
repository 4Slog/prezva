'use client'

import { useState } from 'react'

interface Volunteer {
  id: string
  name: string
  role: string
  status: string
  shift_start: string | null
  shift_end: string | null
  clocked_in_at: string | null
  clocked_out_at: string | null
}

interface Event {
  id: string
  title: string
  slug: string
  start_at: string
  end_at: string
  timezone: string
  venue_name: string | null
  venue_city: string | null
}

interface Props {
  volunteer: Volunteer
  event: Event
  token: string
}

const ROLE_LABELS: Record<string, string> = {
  'check-in': 'Check-In Staff',
  'session-monitor': 'Session Monitor',
  'registration-desk': 'Registration Desk',
  'vip-support': 'VIP Support',
  'general': 'General Volunteer',
}

export function VolunteerPortalClient({ volunteer: initial, event, token }: Props) {
  const [volunteer, setVolunteer] = useState<Volunteer>(initial)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
  const fmtTime = (d: string) =>
    new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  async function clockIn() {
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch(`/api/volunteer/${token}/clock-in`, { method: 'POST' })
      if (res.ok) {
        const json = await res.json()
        setVolunteer(v => ({ ...v, clocked_in_at: json.clocked_in_at, status: 'checked_in' }))
        setMsg('Clocked in successfully!')
      } else {
        setMsg('Could not clock in — please try again.')
      }
    } finally { setLoading(false) }
  }

  async function clockOut() {
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch(`/api/volunteer/${token}/clock-out`, { method: 'POST' })
      if (res.ok) {
        const json = await res.json()
        setVolunteer(v => ({ ...v, clocked_out_at: json.clocked_out_at }))
        setMsg('Clocked out. Thanks for volunteering!')
      } else {
        setMsg('Could not clock out — please try again.')
      }
    } finally { setLoading(false) }
  }

  const totalHours = volunteer.clocked_in_at && volunteer.clocked_out_at
    ? ((new Date(volunteer.clocked_out_at).getTime() - new Date(volunteer.clocked_in_at).getTime()) / 3600000).toFixed(1)
    : null

  return (
    <div style={{ minHeight: '100vh', background: '#0D1B2A', color: '#F0F4F8', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <header style={{ background: '#112240', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 800, fontSize: 18, color: '#00BFA6', letterSpacing: -0.5 }}>P Prezva</span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Volunteer Portal</span>
      </header>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Greeting */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ color: '#00BFA6', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>
            {ROLE_LABELS[volunteer.role] ?? volunteer.role}
          </p>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: 4 }}>
            Hi, {volunteer.name.split(' ')[0]}!
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>
            You&apos;re volunteering at <strong>{event.title}</strong>
          </p>
        </div>

        {/* Event info card */}
        <div style={{ background: '#112240', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '1.25rem', marginBottom: 16 }}>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>📅 {fmtDate(event.start_at)}</p>
          {event.venue_name && (
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
              📍 {event.venue_name}{event.venue_city ? ', ' + event.venue_city : ''}
            </p>
          )}
          {volunteer.shift_start && (
            <p style={{ fontSize: 14, color: '#00BFA6', marginTop: 8, fontWeight: 600 }}>
              ⏰ Your shift: {fmtTime(volunteer.shift_start)}
              {volunteer.shift_end ? ' – ' + fmtTime(volunteer.shift_end) : ''}
            </p>
          )}
        </div>

        {/* Clock in/out */}
        <div style={{ background: '#112240', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '1.25rem', marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.8)' }}>Time Tracking</h2>

          {volunteer.clocked_in_at && (
            <p style={{ fontSize: 13, color: '#00BFA6', marginBottom: 12 }}>
              ✓ Clocked in at {fmtTime(volunteer.clocked_in_at)}
              {volunteer.clocked_out_at && ` → out at ${fmtTime(volunteer.clocked_out_at)}`}
              {totalHours && ` (${totalHours}h total)`}
            </p>
          )}

          {msg && (
            <p style={{ fontSize: 13, color: msg.includes('success') || msg.includes('Thanks') ? '#00BFA6' : '#EF4444', marginBottom: 12 }}>
              {msg}
            </p>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            {!volunteer.clocked_in_at && (
              <button
                onClick={clockIn}
                disabled={loading}
                style={{ background: '#00BFA6', color: '#0D1B2A', padding: '10px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Clocking in…' : 'Clock In'}
              </button>
            )}
            {volunteer.clocked_in_at && !volunteer.clocked_out_at && (
              <button
                onClick={clockOut}
                disabled={loading}
                style={{ background: '#EF4444', color: '#fff', padding: '10px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Clocking out…' : 'Clock Out'}
              </button>
            )}
          </div>
        </div>

        {/* Role-specific tools */}
        {volunteer.role === 'check-in' && (
          <div style={{ background: '#112240', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '1.25rem', marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'rgba(255,255,255,0.8)' }}>Check-In Scanner</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>
              Scan attendee QR codes to check them in.
            </p>
            <a
              href={`/e/${event.slug}/checkin`}
              style={{ display: 'inline-block', background: '#00BFA6', color: '#0D1B2A', padding: '10px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}
            >
              Open QR Scanner
            </a>
          </div>
        )}

        {volunteer.role === 'registration-desk' && (
          <div style={{ background: '#112240', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '1.25rem', marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'rgba(255,255,255,0.8)' }}>Walk-In Registration</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>
              Register walk-in attendees at the front desk.
            </p>
            <a
              href={`/e/${event.slug}/register`}
              style={{ display: 'inline-block', background: '#00BFA6', color: '#0D1B2A', padding: '10px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}
            >
              Open Registration Form
            </a>
          </div>
        )}

        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 32 }}>
          Powered by Prezva · This link is unique to you
        </p>
      </div>
    </div>
  )
}

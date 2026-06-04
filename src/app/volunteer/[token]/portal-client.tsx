'use client'

import { useState, useRef } from 'react'
import { PortalShell } from '@/components/portal/PortalShell'
import { respondToVolunteerShift, sendVolunteerAlert } from '@/lib/volunteers/actions'
import type { AssignedSession } from './page'

interface Volunteer {
  id: string
  name: string
  role: string
  status: string
  shift_start: string | null
  shift_end: string | null
  clocked_in_at: string | null
  clocked_out_at: string | null
  shift_response: string | null
  shift_response_at: string | null
  shift_decline_reason: string | null
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

interface LookupResult {
  id: string
  name: string
  email: string
  status: string
  ticket: string | null
  checked_in: boolean
}

interface Props {
  volunteer: Volunteer
  event: Event
  token: string
  assignedSessions: AssignedSession[]
  isLinkedUser?: boolean
}

const ROLE_LABELS: Record<string, string> = {
  'check-in': 'Check-In Staff',
  'session-monitor': 'Session Monitor',
  'registration-desk': 'Registration Desk',
  'vip-support': 'VIP Support',
  'team-lead': 'Team Lead',
  'general': 'General Volunteer',
}

const ALERT_TYPES = [
  { value: 'urgent', label: 'Urgent', color: 'var(--pz-error)' },
  { value: 'issue',  label: 'Issue',  color: 'var(--pz-warning-fill)' },
  { value: 'question', label: 'Question', color: '#3B82F6' },
  { value: 'info',   label: 'Info',   color: '#64748B' },
] as const

export function VolunteerPortalClient({ volunteer: initial, event, token, assignedSessions, isLinkedUser }: Props) {
  const [volunteer, setVolunteer] = useState<Volunteer>(initial)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const [showDecline, setShowDecline] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [responding, setResponding] = useState(false)
  const [responseMsg, setResponseMsg] = useState('')

  const [lookupQuery, setLookupQuery] = useState('')
  const [lookupResults, setLookupResults] = useState<LookupResult[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showAlert, setShowAlert] = useState(false)
  const [alertType, setAlertType] = useState<'urgent' | 'issue' | 'question' | 'info'>('issue')
  const [alertMsg, setAlertMsg] = useState('')
  const [alertSent, setAlertSent] = useState(false)
  const [sendingAlert, setSendingAlert] = useState(false)

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { timeZone: event.timezone, weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
  const fmtTime = (d: string) =>
    new Date(d).toLocaleTimeString('en-US', { timeZone: event.timezone, hour: 'numeric', minute: '2-digit' })

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

  async function handleResponse(response: 'confirmed' | 'declined', reason?: string) {
    setResponding(true)
    setResponseMsg('')
    try {
      const result = await respondToVolunteerShift(token, response, reason)
      if (result.error) { setResponseMsg('Could not save — please try again.'); return }
      setVolunteer(v => ({ ...v, shift_response: response }))
      setShowDecline(false)
    } catch {
      setResponseMsg('Could not save — please try again.')
    } finally { setResponding(false) }
  }

  function debouncedLookup(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 2) { setLookupResults([]); return }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/volunteer/${token}/lookup?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setLookupResults(data.results ?? [])
    }, 300)
  }

  async function handleSendAlert() {
    if (!alertMsg.trim()) return
    setSendingAlert(true)
    try {
      await sendVolunteerAlert(token, alertType, alertMsg.trim())
      setAlertSent(true)
      setShowAlert(false)
      setAlertMsg('')
      setTimeout(() => setAlertSent(false), 4000)
    } finally { setSendingAlert(false) }
  }

  const totalHours = volunteer.clocked_in_at && volunteer.clocked_out_at
    ? ((new Date(volunteer.clocked_out_at).getTime() - new Date(volunteer.clocked_in_at).getTime()) / 3600000).toFixed(1)
    : null

  const canLookup = ['registration-desk', 'check-in', 'team-lead'].includes(volunteer.role)
  const shiftResponse = volunteer.shift_response ?? 'pending'

  return (
    <PortalShell
      eventName={event.title}
      portalLabel="Volunteer Portal"
      entityName={volunteer.name}
      entityDetail={ROLE_LABELS[volunteer.role] ?? volunteer.role}
      exitHref={isLinkedUser ? '/dashboard' : undefined}
    >
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Greeting */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ color: 'var(--pz-teal-ink)', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>
            {ROLE_LABELS[volunteer.role] ?? volunteer.role}
          </p>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: 4 }}>
            Hi, {volunteer.name.split(' ')[0]}!
          </h1>
          <p style={{ color: 'var(--pz-text)', fontSize: 14 }}>
            You&apos;re volunteering at <strong>{event.title}</strong>
          </p>
        </div>

        {/* Assigned sessions */}
        {assignedSessions.length > 0 ? (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--pz-teal-ink)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 2 }}>
              YOUR ASSIGNMENTS
            </h2>
            {assignedSessions.map(s => (
              <div key={s.id} style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '0.875rem 1rem', marginBottom: 8 }}>
                <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--pz-text)', margin: '0 0 4px' }}>{s.title}</p>
                <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: 0 }}>
                  {new Date(s.starts_at).toLocaleTimeString('en-US', { timeZone: event.timezone, hour: 'numeric', minute: '2-digit' })}
                  {Array.isArray(s.rooms) ? (s.rooms[0]?.name ? ` · ${s.rooms[0].name}` : '') : (s.rooms?.name ? ` · ${(s.rooms as { name: string }).name}` : '')}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginBottom: 24, padding: '1rem', background: 'var(--pz-surface)', borderRadius: 10, border: '1px solid var(--pz-border)', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--pz-muted)', margin: 0 }}>
              No sessions assigned yet. Check with your event coordinator.
            </p>
          </div>
        )}

        {/* Shift response */}
        {shiftResponse === 'pending' && (
          <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1rem', marginBottom: 16 }}>
            <p style={{ fontWeight: 600, fontSize: 14, margin: '0 0 12px', color: 'var(--pz-text)' }}>
              Can you make it?
            </p>
            {responseMsg && <p style={{ fontSize: 12, color: 'var(--pz-error)', marginBottom: 8 }}>{responseMsg}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleResponse('confirmed')}
                disabled={responding}
                style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: 'none', background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', fontWeight: 700, cursor: responding ? 'not-allowed' : 'pointer', opacity: responding ? 0.7 : 1 }}
              >
                Yes, I&apos;ll be there
              </button>
              <button
                onClick={() => setShowDecline(true)}
                disabled={responding}
                style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: '1px solid var(--pz-border)', background: 'transparent', color: 'var(--pz-muted)', cursor: responding ? 'not-allowed' : 'pointer' }}
              >
                Can&apos;t make it
              </button>
            </div>
            {showDecline && (
              <div style={{ marginTop: 12 }}>
                <textarea
                  placeholder="Reason (optional)"
                  rows={2}
                  value={declineReason}
                  onChange={e => setDeclineReason(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 8, border: '1px solid var(--pz-border)', fontSize: 14, background: 'var(--pz-bg)', color: 'var(--pz-text)', boxSizing: 'border-box' }}
                />
                <button
                  onClick={() => handleResponse('declined', declineReason)}
                  disabled={responding}
                  style={{ marginTop: 8, width: '100%', padding: '0.625rem', borderRadius: 8, border: '1px solid var(--pz-border)', background: 'transparent', color: 'var(--pz-muted)', cursor: responding ? 'not-allowed' : 'pointer', opacity: responding ? 0.7 : 1 }}
                >
                  {responding ? 'Saving…' : 'Submit'}
                </button>
              </div>
            )}
          </div>
        )}
        {shiftResponse === 'confirmed' && (
          <div style={{ background: 'var(--pz-teal-bg)', border: '1px solid var(--pz-teal)', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--pz-teal-ink)', margin: 0, fontWeight: 600 }}>You confirmed your shift</p>
          </div>
        )}
        {shiftResponse === 'declined' && (
          <div style={{ background: 'var(--pz-error-bg)', border: '1px solid var(--pz-error)', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--pz-error)', margin: 0 }}>You declined this shift</p>
          </div>
        )}

        {/* Event info card */}
        <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 12, padding: '1.25rem', marginBottom: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--pz-muted)', marginBottom: 4 }}>📅 {fmtDate(event.start_at)}</p>
          {event.venue_name && (
            <p style={{ fontSize: 14, color: 'var(--pz-muted)' }}>
              📍 {event.venue_name}{event.venue_city ? ', ' + event.venue_city : ''}
            </p>
          )}
          {volunteer.shift_start && (
            <p style={{ fontSize: 14, color: 'var(--pz-teal-ink)', marginTop: 8, fontWeight: 600 }}>
              Your shift: {fmtTime(volunteer.shift_start)}
              {volunteer.shift_end ? ' – ' + fmtTime(volunteer.shift_end) : ''}
            </p>
          )}
        </div>

        {/* Clock in/out */}
        <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 12, padding: '1.25rem', marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--pz-text)' }}>Time Tracking</h2>
          {volunteer.clocked_in_at && (
            <p style={{ fontSize: 13, color: 'var(--pz-teal-ink)', marginBottom: 12 }}>
              Clocked in at {fmtTime(volunteer.clocked_in_at)}
              {volunteer.clocked_out_at && ` → out at ${fmtTime(volunteer.clocked_out_at)}`}
              {totalHours && ` (${totalHours}h total)`}
            </p>
          )}
          {msg && (
            <p style={{ fontSize: 13, color: msg.includes('success') || msg.includes('Thanks') ? 'var(--pz-teal-ink)' : 'var(--pz-error)', marginBottom: 12 }}>
              {msg}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            {!volunteer.clocked_in_at && (
              <button onClick={clockIn} disabled={loading} style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', padding: '10px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Clocking in…' : 'Clock In'}
              </button>
            )}
            {volunteer.clocked_in_at && !volunteer.clocked_out_at && (
              <button onClick={clockOut} disabled={loading} style={{ background: 'var(--pz-error)', color: '#fff', padding: '10px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Clocking out…' : 'Clock Out'}
              </button>
            )}
          </div>
        </div>

        {/* Role-specific tools */}
        {volunteer.role === 'check-in' && (
          <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 12, padding: '1.25rem', marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--pz-text)' }}>Check-In Scanner</h2>
            <p style={{ fontSize: 13, color: 'var(--pz-muted)', marginBottom: 12 }}>Scan attendee QR codes to check them in.</p>
            <a href={`/volunteer/${token}/scan`} style={{ display: 'inline-block', background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', padding: '10px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              Open QR Scanner
            </a>
          </div>
        )}
        {volunteer.role === 'registration-desk' && (
          <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 12, padding: '1.25rem', marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--pz-text)' }}>Walk-In Registration</h2>
            <p style={{ fontSize: 13, color: 'var(--pz-muted)', marginBottom: 12 }}>Register walk-in attendees at the front desk.</p>
            <a href={`/e/${event.slug}/register`} style={{ display: 'inline-block', background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', padding: '10px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              Open Registration Form
            </a>
          </div>
        )}

        {/* Attendee lookup */}
        {canLookup && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--pz-teal-ink)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 2 }}>
              ATTENDEE LOOKUP
            </h2>
            <input
              type="search"
              placeholder="Search name or email..."
              value={lookupQuery}
              onChange={e => { setLookupQuery(e.target.value); debouncedLookup(e.target.value) }}
              style={{ width: '100%', padding: '0.75rem', borderRadius: 10, fontSize: 16, border: '1px solid var(--pz-border)', background: 'var(--pz-surface)', color: 'var(--pz-text)', marginBottom: 8, boxSizing: 'border-box' }}
            />
            {lookupResults.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--pz-surface)', borderRadius: 8, marginBottom: 6, border: '1px solid var(--pz-border)' }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14, margin: 0, color: 'var(--pz-text)' }}>{r.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: 0 }}>{r.ticket ? `${r.ticket} · ` : ''}{r.email}</p>
                </div>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 600, background: r.checked_in ? 'var(--pz-teal-bg)' : 'var(--pz-warning-bg)', color: r.checked_in ? 'var(--pz-teal-ink)' : 'var(--pz-warning)', whiteSpace: 'nowrap', marginLeft: 8 }}>
                  {r.checked_in ? 'Checked in' : r.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Alert organizer */}
        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--pz-border)' }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--pz-label)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 2 }}>
            SEND ALERT TO ORGANIZER
          </h2>
          {!showAlert ? (
            <button onClick={() => setShowAlert(true)} style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--pz-border)', background: 'transparent', color: 'var(--pz-label)', cursor: 'pointer', fontSize: 14 }}>
              + Send alert
            </button>
          ) : (
            <div style={{ background: 'var(--pz-surface)', borderRadius: 10, border: '1px solid var(--pz-border)', padding: '1rem' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                {ALERT_TYPES.map(t => (
                  <button key={t.value} onClick={() => setAlertType(t.value)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: `1px solid ${alertType === t.value ? t.color : 'var(--pz-border)'}`, background: alertType === t.value ? t.color + '22' : 'transparent', color: alertType === t.value ? t.color : 'var(--pz-label)', fontWeight: 600 }}>
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                placeholder="Describe the situation..."
                value={alertMsg}
                onChange={e => setAlertMsg(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 8, fontSize: 14, border: '1px solid var(--pz-border)', background: 'var(--pz-bg)', color: 'var(--pz-text)', marginBottom: 10, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSendAlert} disabled={!alertMsg.trim() || sendingAlert} style={{ flex: 1, padding: '0.625rem', borderRadius: 8, border: 'none', background: alertType === 'urgent' ? 'var(--pz-error)' : 'var(--pz-teal)', color: alertType === 'urgent' ? '#fff' : 'var(--pz-on-accent)', fontWeight: 700, cursor: !alertMsg.trim() || sendingAlert ? 'not-allowed' : 'pointer', opacity: !alertMsg.trim() || sendingAlert ? 0.5 : 1 }}>
                  {sendingAlert ? 'Sending…' : 'Send alert'}
                </button>
                <button onClick={() => { setShowAlert(false); setAlertMsg('') }} style={{ padding: '0.625rem 1rem', borderRadius: 8, border: '1px solid var(--pz-border)', background: 'transparent', color: 'var(--pz-label)', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {alertSent && (
            <p style={{ fontSize: 12, color: 'var(--pz-teal-ink)', marginTop: 8, textAlign: 'center' }}>Alert sent to organizer</p>
          )}
        </div>

        <p style={{ fontSize: 12, color: 'var(--pz-muted)', textAlign: 'center', marginTop: 32 }}>
          Powered by Prezva · This link is unique to you
        </p>
      </div>
    </PortalShell>
  )
}

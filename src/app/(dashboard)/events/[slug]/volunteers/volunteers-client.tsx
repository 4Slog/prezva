'use client'

import { useState } from 'react'
import { resolveVolunteerAlert, exportVolunteerHours } from '@/lib/volunteers/actions'
import { Field } from '@/components/ui/Field'

interface Volunteer {
  id: string
  name: string
  email: string
  phone?: string | null
  role: string
  shift_start?: string | null
  shift_end?: string | null
  status: string
  shift_response?: string | null
  portal_access_token: string
  clocked_in_at?: string | null
  clocked_out_at?: string | null
  notes?: string | null
}

interface VolunteerAlert {
  id: string
  volunteer_id: string
  alert_type: string
  message: string
  resolved: boolean
  created_at: string
  volunteers: { name: string } | null
}

interface Session {
  id: string
  title: string
  starts_at: string
}

interface Props {
  eventId: string
  eventSlug: string
  volunteers: Volunteer[]
  sessions: Session[]
  alerts: VolunteerAlert[]
}

const ROLES = ['check-in', 'session-monitor', 'registration-desk', 'vip-support', 'team-lead', 'general']
const STATUSES = ['All', 'invited', 'confirmed', 'checked_in', 'no_show']

const STATUS_COLORS: Record<string, string> = {
  invited:    'var(--pz-muted)',
  confirmed:  '#0ea5e9',
  checked_in: 'var(--pz-success)',
  no_show:    'var(--pz-error)',
  declined:   'var(--pz-warning-fill)',
}

function fmtShift(start?: string | null, end?: string | null) {
  if (!start) return '—'
  const s = new Date(start).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  if (!end) return s
  const e = new Date(end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${s} – ${e}`
}

const ALERT_TYPE_COLORS: Record<string, string> = {
  urgent:   'var(--pz-error)',
  issue:    'var(--pz-warning-fill)',
  question: '#3B82F6',
  info:     'var(--pz-muted)',
}

const SHIFT_RESPONSE_COLORS: Record<string, string> = {
  confirmed: 'var(--pz-success)',
  declined:  'var(--pz-error)',
  pending:   'var(--pz-muted)',
}

export function VolunteersClient({ eventId, eventSlug, volunteers: initial, sessions, alerts: initialAlerts }: Props) {
  const [volunteers, setVolunteers] = useState<Volunteer[]>(initial)
  const [alerts, setAlerts] = useState<VolunteerAlert[]>(initialAlerts)
  const [filterStatus, setFilterStatus] = useState('All')
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [form, setForm] = useState({
    name: '', email: '', phone: '', role: 'check-in',
    shift_start: '', shift_end: '', notes: '',
  })
  const [err, setErr] = useState('')

  async function handleResolveAlert(alertId: string) {
    await resolveVolunteerAlert(alertId)
    setAlerts(a => a.filter(x => x.id !== alertId))
  }

  async function handleExportHours() {
    setExporting(true)
    try {
      const result = await exportVolunteerHours(eventId)
      if ('error' in result) return
      const blob = new Blob([result.csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const filtered = filterStatus === 'All'
    ? volunteers
    : volunteers.filter(v => v.status === filterStatus)

  const checkedIn = volunteers.filter(v => v.status === 'checked_in').length

  const appUrl = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://prezva.app'

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      const res = await fetch(`/api/events/${eventSlug}/volunteers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, event_id: eventId }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error ?? 'Failed to add volunteer'); return }
      setVolunteers(v => [...v, json.volunteer])
      setForm({ name: '', email: '', phone: '', role: 'check-in', shift_start: '', shift_end: '', notes: '' })
      setShowAdd(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleAction(id: string, action: 'checkin' | 'resend' | 'remove') {
    if (action === 'remove' && !confirm('Remove this volunteer?')) return
    const res = await fetch(`/api/events/${eventSlug}/volunteers/${id}/${action}`, { method: 'POST' })
    if (!res.ok) return
    if (action === 'remove') {
      setVolunteers(v => v.filter(x => x.id !== id))
    } else if (action === 'checkin') {
      setVolunteers(v => v.map(x => x.id === id ? { ...x, status: 'checked_in' } : x))
    }
  }

  return (
    <div>
      {/* Alert inbox */}
      {alerts.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '1rem', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-error)', margin: 0 }}>Volunteer Alerts</h2>
            <span style={{ fontSize: 11, background: 'var(--pz-error)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontWeight: 700 }}>
              {alerts.length}
            </span>
          </div>
          {alerts.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '0.625rem 0', borderTop: '1px solid rgba(239,68,68,0.15)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, fontWeight: 700, background: ALERT_TYPE_COLORS[a.alert_type] + '22', color: ALERT_TYPE_COLORS[a.alert_type] }}>
                    {a.alert_type}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--pz-text)' }}>{a.volunteers?.name ?? 'Volunteer'}</span>
                  <span style={{ fontSize: 11, color: 'var(--pz-muted)' }}>
                    {new Date(a.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--pz-text)', margin: 0 }}>{a.message}</p>
              </div>
              <button
                onClick={() => handleResolveAlert(a.id)}
                style={{ fontSize: 12, color: 'var(--pz-muted)', background: 'none', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Resolve
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pz-text)', marginBottom: 4 }}>
            Volunteers ({volunteers.length})
          </h1>
          <p style={{ fontSize: 13, color: 'var(--pz-muted)' }}>
            {checkedIn} of {volunteers.length} checked in today
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleExportHours}
            disabled={exporting}
            style={{ background: 'transparent', color: 'var(--pz-muted)', padding: '8px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, border: '1px solid var(--pz-border)', cursor: exporting ? 'not-allowed' : 'pointer', opacity: exporting ? 0.6 : 1 }}
          >
            {exporting ? 'Exporting…' : 'Export hours CSV'}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' }}
          >
            + Add Volunteer
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 16 }}>Add Volunteer</h3>
          {err && <p style={{ color: 'var(--pz-error)', fontSize: 13, marginBottom: 12 }}>{err}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Field label="Name" htmlFor="vol-name" required>
              <input id="vol-name" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={{ width: '100%', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--pz-text)', boxSizing: 'border-box' }} />
            </Field>
            <Field label="Email" htmlFor="vol-email" required>
              <input id="vol-email" required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                style={{ width: '100%', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--pz-text)', boxSizing: 'border-box' }} />
            </Field>
            <Field label="Phone" htmlFor="vol-phone">
              <input id="vol-phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                style={{ width: '100%', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--pz-text)', boxSizing: 'border-box' }} />
            </Field>
            <Field label="Role" htmlFor="vol-role" required>
              <select id="vol-role" required value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                style={{ width: '100%', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--pz-text)', boxSizing: 'border-box' }}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Shift Start" htmlFor="vol-shift-start">
              <input id="vol-shift-start" type="datetime-local" value={form.shift_start} onChange={e => setForm(f => ({ ...f, shift_start: e.target.value }))}
                style={{ width: '100%', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--pz-text)', boxSizing: 'border-box' }} />
            </Field>
            <Field label="Shift End" htmlFor="vol-shift-end">
              <input id="vol-shift-end" type="datetime-local" value={form.shift_end} onChange={e => setForm(f => ({ ...f, shift_end: e.target.value }))}
                style={{ width: '100%', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--pz-text)', boxSizing: 'border-box' }} />
            </Field>
          </div>
          <div style={{ marginBottom: 16 }}>
            <Field label="Notes" htmlFor="vol-notes">
              <textarea id="vol-notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                style={{ width: '100%', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--pz-text)', boxSizing: 'border-box', resize: 'vertical' }} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={saving}
              style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', padding: '8px 16px', borderRadius: 6, fontWeight: 700, fontSize: 13, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Add & Send Invite'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)}
              style={{ background: 'transparent', border: '1px solid var(--pz-border)', color: 'var(--pz-muted)', padding: '8px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--pz-border)', paddingBottom: 0 }}>
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            style={{
              padding: '6px 14px', fontSize: 13, fontWeight: 500,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: filterStatus === s ? 'var(--pz-teal)' : 'var(--pz-muted)',
              borderBottom: filterStatus === s ? '2px solid var(--pz-teal)' : '2px solid transparent',
              marginBottom: -1,
            }}>
            {s === 'All' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--pz-muted)', fontSize: 14 }}>
          No volunteers{filterStatus !== 'All' ? ` with status "${filterStatus}"` : ''} yet.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--pz-border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)' }}>
                {['Name', 'Email', 'Role', 'Shift', 'Status', 'Response', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--pz-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((v, i) => (
                <tr key={v.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--pz-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--pz-text)', fontWeight: 500 }}>{v.name}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--pz-muted)' }}>{v.email}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12 }}>
                    <span style={{ background: 'var(--pz-teal-bg)', color: 'var(--pz-teal-ink)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                      {v.role}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--pz-muted)' }}>
                    {fmtShift(v.shift_start, v.shift_end)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLORS[v.status] ?? 'var(--pz-muted)', textTransform: 'capitalize' }}>
                      {v.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {(() => {
                      const r = v.shift_response ?? 'pending'
                      return (
                        <span style={{ fontSize: 11, fontWeight: 600, color: SHIFT_RESPONSE_COLORS[r] ?? 'var(--pz-muted)', textTransform: 'capitalize' }}>
                          {r}
                        </span>
                      )
                    })()}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <a href={`${appUrl}/volunteer/${v.portal_access_token}`} target="_blank" rel="noreferrer"
                        style={{ fontSize: 12, color: 'var(--pz-teal)', textDecoration: 'none' }}>Portal</a>
                      {v.status !== 'checked_in' && (
                        <button onClick={() => handleAction(v.id, 'checkin')}
                          style={{ fontSize: 12, color: 'var(--pz-success)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Check in</button>
                      )}
                      <button onClick={() => handleAction(v.id, 'resend')}
                        style={{ fontSize: 12, color: 'var(--pz-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Resend</button>
                      <button onClick={() => handleAction(v.id, 'remove')}
                        style={{ fontSize: 12, color: 'var(--pz-error)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

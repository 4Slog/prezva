'use client'
import { useState } from 'react'
import {
  upsertRosItem,
  updateRosItemStatus,
  deleteRosItem,
  importSessionsToRos,
} from '@/lib/events/run-of-show-actions'
import { Field } from '@/components/ui/Field'

interface RosItem {
  id: string
  time_at: string
  duration_minutes: number
  title: string
  description?: string | null
  responsible_person?: string | null
  responsible_email?: string | null
  status: 'upcoming' | 'in_progress' | 'done' | 'skipped'
  sort_order: number
}

interface Session {
  id: string
  title: string
  starts_at: string
  ends_at?: string | null
  session_speakers?: { speakers?: { name?: string } | null }[]
}

interface Props {
  eventId: string
  initItems: RosItem[]
  sessions: Session[]
}

const STATUS_COLOR: Record<string, string> = {
  upcoming: 'var(--pz-muted)',
  in_progress: 'var(--pz-teal)',
  done: 'var(--pz-success-fill)',
  skipped: 'var(--pz-error)',
}

const EMPTY_FORM = {
  time_at: '',
  duration_minutes: 30,
  title: '',
  responsible_person: '',
  responsible_email: '',
}

export function RunOfShowClient({ eventId, initItems, sessions }: Props) {
  const [items, setItems] = useState<RosItem[]>(initItems)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await upsertRosItem(eventId, {
      time_at: form.time_at,
      duration_minutes: form.duration_minutes,
      title: form.title,
      responsible_person: form.responsible_person || undefined,
      responsible_email: form.responsible_email || undefined,
      sort_order: items.length,
    })
    setSaving(false)
    if (res && 'error' in res && res.error) { setError(res.error); return }
    // Reload page to get fresh data with new id
    window.location.reload()
  }

  async function handleStatus(itemId: string, status: RosItem['status']) {
    await updateRosItemStatus(itemId, status)
    setItems(prev => prev.map(item =>
      item.id === itemId
        ? { ...item, status }
        : status === 'in_progress' && item.status === 'in_progress'
          ? { ...item, status: 'upcoming' as const }
          : item
    ))
  }

  async function handleDelete(itemId: string) {
    await deleteRosItem(itemId)
    setItems(prev => prev.filter(i => i.id !== itemId))
  }

  async function handleImport() {
    setImporting(true)
    setError(null)
    const res = await importSessionsToRos(eventId)
    setImporting(false)
    if ('error' in res && res.error) { setError(res.error); return }
    window.location.reload()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => { setShowForm(true); setForm(EMPTY_FORM) }}
          style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: 'none',
                   background: 'var(--pz-teal)', color: 'var(--pz-on-accent)',
                   fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          + Add item
        </button>
        {sessions.length > 0 && (
          <button
            onClick={handleImport}
            disabled={importing}
            style={{ padding: '0.5rem 1.25rem', borderRadius: 8,
                     border: '1px solid var(--pz-border)', background: 'transparent',
                     color: 'var(--pz-muted)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                     opacity: importing ? 0.6 : 1 }}>
            {importing ? 'Importing…' : '↓ Import from sessions'}
          </button>
        )}
      </div>

      {error && (
        <p style={{ color: 'var(--pz-error)', fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}

      {showForm && (
        <form onSubmit={handleSave} style={{ padding: '1.25rem', background: 'var(--pz-surface)',
                                              borderRadius: 12, border: '1px solid var(--pz-border)',
                                              marginBottom: '1.5rem' }}>
          <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>New item</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Time" htmlFor="ros-time" required>
                <input
                  id="ros-time"
                  type="datetime-local"
                  required
                  value={form.time_at}
                  onChange={e => setForm(f => ({ ...f, time_at: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8,
                           border: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)',
                           color: 'var(--pz-text)', fontSize: 14, boxSizing: 'border-box' }}
                />
              </Field>
              <Field label="Duration (min)" htmlFor="ros-duration" required>
                <input
                  id="ros-duration"
                  type="number"
                  required
                  min={1}
                  value={form.duration_minutes}
                  onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 5 }))}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8,
                           border: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)',
                           color: 'var(--pz-text)', fontSize: 14, boxSizing: 'border-box' }}
                />
              </Field>
            </div>
            <Field label="Title" htmlFor="ros-title" required>
              <input
                id="ros-title"
                type="text"
                required
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Keynote address"
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8,
                         border: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)',
                         color: 'var(--pz-text)', fontSize: 14, boxSizing: 'border-box' }}
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Responsible person" htmlFor="ros-person">
                <input
                  id="ros-person"
                  type="text"
                  value={form.responsible_person}
                  onChange={e => setForm(f => ({ ...f, responsible_person: e.target.value }))}
                  placeholder="Name"
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8,
                           border: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)',
                           color: 'var(--pz-text)', fontSize: 14, boxSizing: 'border-box' }}
                />
              </Field>
              <Field label="Email (for cue notifications)" htmlFor="ros-email">
                <input
                  id="ros-email"
                  type="email"
                  value={form.responsible_email}
                  onChange={e => setForm(f => ({ ...f, responsible_email: e.target.value }))}
                  placeholder="email@example.com"
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8,
                           border: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)',
                           color: 'var(--pz-text)', fontSize: 14, boxSizing: 'border-box' }}
                />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving}
                style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: 'none',
                         background: 'var(--pz-teal)', color: 'var(--pz-on-accent)',
                         fontWeight: 700, fontSize: 13, cursor: 'pointer',
                         opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                style={{ padding: '0.5rem 1rem', borderRadius: 8,
                         border: '1px solid var(--pz-border)', background: 'transparent',
                         color: 'var(--pz-muted)', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {items.length === 0 && !showForm ? (
        <p style={{ color: 'var(--pz-muted)', textAlign: 'center', padding: '3rem' }}>
          No run of show items yet. Add one above or import from sessions.
        </p>
      ) : (
        items.map(item => (
          <div key={item.id} style={{
            display: 'flex', gap: 12, padding: '0.875rem',
            background: item.status === 'in_progress' ? 'var(--pz-teal-bg)' : 'var(--pz-surface)',
            borderRadius: 10, marginBottom: 8,
            border: `1px solid ${item.status === 'in_progress' ? 'var(--pz-teal)' : 'var(--pz-border)'}`,
          }}>
            <div style={{ width: 60, flexShrink: 0, textAlign: 'center' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>
                {new Date(item.time_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
              <p style={{ fontSize: 10, color: 'var(--pz-muted)', margin: 0 }}>{item.duration_minutes}m</p>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--pz-text)', margin: '0 0 2px' }}>
                {item.title}
              </p>
              {item.responsible_person && (
                <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: 0 }}>
                  → {item.responsible_person}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
              <span style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                background: STATUS_COLOR[item.status] + '22',
                color: STATUS_COLOR[item.status],
              }}>
                {item.status.replace('_', ' ')}
              </span>
              {item.status === 'upcoming' && (
                <button onClick={() => handleStatus(item.id, 'in_progress')}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
                           border: '1px solid var(--pz-teal)', background: 'transparent',
                           color: 'var(--pz-teal)', cursor: 'pointer' }}>
                  ▶ Start
                </button>
              )}
              {item.status === 'in_progress' && (
                <>
                  <button onClick={() => handleStatus(item.id, 'done')}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
                             border: '1px solid var(--pz-success-fill)', background: 'transparent',
                             color: 'var(--pz-success-fill)', cursor: 'pointer' }}>
                    ✓ Done
                  </button>
                  <button onClick={() => handleStatus(item.id, 'skipped')}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
                             border: '1px solid var(--pz-error)', background: 'transparent',
                             color: 'var(--pz-error)', cursor: 'pointer' }}>
                    ↷ Skip
                  </button>
                </>
              )}
              {item.status === 'upcoming' && (
                <button onClick={() => handleStatus(item.id, 'skipped')}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
                           border: '1px solid var(--pz-border)', background: 'transparent',
                           color: 'var(--pz-muted)', cursor: 'pointer' }}>
                  ↷ Skip
                </button>
              )}
              <button onClick={() => handleDelete(item.id)}
                style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6,
                         border: '1px solid var(--pz-border)', background: 'transparent',
                         color: 'var(--pz-muted)', cursor: 'pointer' }}>
                ✕
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

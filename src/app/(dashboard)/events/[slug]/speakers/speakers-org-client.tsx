'use client'

import { useState } from 'react'
import { sendSpeakerInvite, createSpeaker, markSpeakerArrived } from '@/lib/speaker/speaker-actions'

type Props = {
  event: any
  speakers: any[]
}

const statusBadge: Record<string, { bg: string; label: string }> = {
  invited:   { bg: 'var(--pz-warning, #f59e0b)',  label: 'Invited' },
  confirmed: { bg: 'var(--pz-success)',            label: 'Confirmed' },
  declined:  { bg: 'var(--pz-error, #ef4444)',     label: 'Declined' },
}

export function SpeakersOrgClient({ event, speakers: initialSpeakers }: Props) {
  const [speakers, setSpeakers] = useState<any[]>(initialSpeakers)
  const [inviting, setInviting] = useState<string | null>(null)
  const [inviteResult, setInviteResult] = useState<Record<string, string>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', job_title: '', company: '', bio: '', event_role: 'speaker' })

  async function invite(speakerId: string) {
    setInviting(speakerId)
    const appUrl = window.location.origin
    const result = await sendSpeakerInvite(event.id, speakerId, appUrl)
    setInviteResult(prev => ({
      ...prev,
      [speakerId]: (result as any).error ?? ((result as any).sent ? 'Invite sent!' : `Portal: ${(result as any).portalUrl ?? ''}`)
    }))
    setInviting(null)
  }

  async function markArrived(speakerId: string) {
    await markSpeakerArrived(speakerId)
    setSpeakers(prev => prev.map(sp =>
      sp.id === speakerId ? { ...sp, checked_in_at: new Date().toISOString() } : sp
    ))
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setAddError('Name is required'); return }
    setAdding(true)
    setAddError('')
    const result = await createSpeaker(event.id, form)
    setAdding(false)
    if ((result as any).error) {
      setAddError((result as any).error)
    } else {
      setSpeakers(prev => [...prev, (result as any).data])
      setForm({ name: '', email: '', job_title: '', company: '', bio: '', event_role: 'speaker' })
      setShowAdd(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      <div className="flex justify-end">
        <button
          onClick={() => { setShowAdd(s => !s); setAddError('') }}
          className="rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: 'var(--pz-teal)', color: '#fff' }}
        >
          {showAdd ? 'Cancel' : '+ Add Speaker'}
        </button>
      </div>

      {/* Add speaker form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="pz-card p-4 space-y-3">
          <h3 className="font-medium text-sm" style={{ color: 'var(--pz-text)' }}>New Speaker</h3>
          {addError && <p className="text-xs" style={{ color: 'var(--pz-error, #ef4444)' }}>{addError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--pz-muted)' }}>Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                className="w-full rounded-lg px-3 py-2 text-sm border" style={{ background: 'var(--pz-surface)', borderColor: 'var(--pz-border)', color: 'var(--pz-text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--pz-muted)' }}>Email</label>
              <input value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}
                type="email" className="w-full rounded-lg px-3 py-2 text-sm border" style={{ background: 'var(--pz-surface)', borderColor: 'var(--pz-border)', color: 'var(--pz-text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--pz-muted)' }}>Job title</label>
              <input value={form.job_title} onChange={e => setForm(f => ({...f, job_title: e.target.value}))}
                className="w-full rounded-lg px-3 py-2 text-sm border" style={{ background: 'var(--pz-surface)', borderColor: 'var(--pz-border)', color: 'var(--pz-text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--pz-muted)' }}>Company</label>
              <input value={form.company} onChange={e => setForm(f => ({...f, company: e.target.value}))}
                className="w-full rounded-lg px-3 py-2 text-sm border" style={{ background: 'var(--pz-surface)', borderColor: 'var(--pz-border)', color: 'var(--pz-text)' }} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--pz-muted)' }}>Event role</label>
            <select value={form.event_role} onChange={e => setForm(f => ({...f, event_role: e.target.value}))}
              className="w-full rounded-lg px-3 py-2 text-sm border" style={{ background: 'var(--pz-surface)', borderColor: 'var(--pz-border)', color: 'var(--pz-text)' }}>
              <option value="speaker">Speaker</option>
              <option value="mc">MC / Emcee</option>
              <option value="chair">Program Chair</option>
              <option value="host">Host</option>
              <option value="guest">Guest</option>
              <option value="vip">VIP</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--pz-muted)' }}>Bio</label>
            <textarea value={form.bio} onChange={e => setForm(f => ({...f, bio: e.target.value}))} rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm border" style={{ background: 'var(--pz-surface)', borderColor: 'var(--pz-border)', color: 'var(--pz-text)', resize: 'vertical' }} />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="submit" disabled={adding}
              className="rounded-lg px-4 py-2 text-sm font-medium"
              style={{ background: 'var(--pz-teal)', color: '#fff', opacity: adding ? 0.6 : 1 }}>
              {adding ? 'Adding…' : 'Add Speaker'}
            </button>
          </div>
        </form>
      )}

      {/* Empty state */}
      {speakers.length === 0 && !showAdd && (
        <div className="pz-card p-6 text-center">
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
            No speakers yet. Click <strong>+ Add Speaker</strong> to add your first speaker.
          </p>
        </div>
      )}

      {/* Speaker list */}
      {speakers.map((sp: any) => {
        const badge = statusBadge[sp.status ?? 'invited'] ?? statusBadge.invited
        return (
          <div key={sp.id} className="pz-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-medium text-sm" style={{ color: 'var(--pz-text)' }}>{sp.name}</p>
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ background: badge.bg, color: '#fff' }}>{badge.label}</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>
                  {sp.email ?? 'No email'}
                  {sp.job_title && ` · ${sp.job_title}`}
                  {sp.company && sp.company !== sp.job_title && `, ${sp.company}`}
                </p>
                {sp.confirmed_at && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--pz-success)' }}>
                    Confirmed {new Date(sp.confirmed_at).toLocaleDateString()}
                  </p>
                )}
                {sp.decline_reason && (
                  <p style={{ fontSize: 11, color: 'var(--pz-muted)', marginTop: 2, fontStyle: 'italic' }}>
                    "{sp.decline_reason}"
                  </p>
                )}
                {inviteResult[sp.id] && (
                  <p className="text-xs mt-1" style={{ color: inviteResult[sp.id].startsWith('Portal:') ? 'var(--pz-muted)' : 'var(--pz-success)', wordBreak: 'break-all' }}>
                    {inviteResult[sp.id]}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                <button onClick={() => invite(sp.id)} disabled={inviting === sp.id || !sp.email}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium"
                  style={{ background: 'var(--pz-teal)', color: '#fff', opacity: !sp.email ? 0.5 : 1 }}>
                  {inviting === sp.id ? 'Sending…' : 'Send invite'}
                </button>
                {!sp.checked_in_at ? (
                  <button onClick={() => markArrived(sp.id)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-muted)', background: 'transparent', cursor: 'pointer' }}>
                    Mark arrived
                  </button>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--pz-teal)', alignSelf: 'center' }}>
                    ✓ Arrived {new Date(sp.checked_in_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                )}
                {sp.confirmation_token && (
                  <a href={`/speaker/confirm/${sp.confirmation_token}`} target="_blank" rel="noreferrer"
                    className="rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}>
                    Confirm link
                  </a>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

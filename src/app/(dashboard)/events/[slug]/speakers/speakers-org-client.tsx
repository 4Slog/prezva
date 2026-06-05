'use client'

import { useState } from 'react'
import { sendSpeakerInvite, createSpeaker, markSpeakerArrived, renewSpeakerToken, getOrgSpeakerLibrary, addSpeakerFromLibrary } from '@/lib/speaker/speaker-actions'
import { Field } from '@/components/ui/Field'

type Props = {
  event: any
  speakers: any[]
}

const statusBadge: Record<string, { bg: string; label: string }> = {
  invited:   { bg: 'var(--pz-warning, var(--pz-warning-fill))',  label: 'Invited' },
  confirmed: { bg: 'var(--pz-success)',            label: 'Confirmed' },
  declined:  { bg: 'var(--pz-error, var(--pz-error))',     label: 'Declined' },
}

export function SpeakersOrgClient({ event, speakers: initialSpeakers }: Props) {
  const [speakers, setSpeakers] = useState<any[]>(initialSpeakers)
  const [inviting, setInviting] = useState<string | null>(null)
  const [inviteResult, setInviteResult] = useState<Record<string, string>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', job_title: '', company: '', bio: '', event_role: 'speaker' })
  const [showLibrary, setShowLibrary] = useState(false)
  const [libSpeakers, setLibSpeakers] = useState<any[]>([])
  const [libLoading, setLibLoading] = useState(false)
  const [libAdding, setLibAdding] = useState<string | null>(null)
  const [libResult, setLibResult] = useState<Record<string, string>>({})

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

  async function openLibrary() {
    setShowLibrary(true)
    if (libSpeakers.length > 0) return
    setLibLoading(true)
    const lib = await getOrgSpeakerLibrary(event.org_id)
    setLibSpeakers(lib)
    setLibLoading(false)
  }

  async function addFromLib(orgSpeakerId: string) {
    setLibAdding(orgSpeakerId)
    const result = await addSpeakerFromLibrary(event.id, orgSpeakerId)
    setLibResult(prev => ({ ...prev, [orgSpeakerId]: (result as any).error ?? 'Added!' }))
    setLibAdding(null)
  }

  return (
    <div className="space-y-4">
      {/* Header with Add buttons */}
      <div className="flex justify-end gap-2">
        <button
          onClick={openLibrary}
          className="rounded-lg px-4 py-2 text-sm font-medium"
          style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-text)', background: 'transparent' }}
        >
          + From library
        </button>
        <button
          onClick={() => { setShowAdd(s => !s); setAddError('') }}
          className="rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: 'var(--pz-teal)', color: 'var(--pz-surface)' }}
        >
          {showAdd ? 'Cancel' : '+ Add Speaker'}
        </button>
      </div>

      {/* Library modal */}
      {showLibrary && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--pz-surface)', borderRadius: 12, padding: 24,
                        width: '100%', maxWidth: 600, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>Speaker Library</h2>
              <button onClick={() => setShowLibrary(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pz-muted)', fontSize: 18 }}>✕</button>
            </div>
            {libLoading ? (
              <p style={{ color: 'var(--pz-muted)', fontSize: 13 }}>Loading…</p>
            ) : libSpeakers.length === 0 ? (
              <p style={{ color: 'var(--pz-muted)', fontSize: 13 }}>
                No speakers in library yet. Speakers are added automatically when they confirm their invitation.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {libSpeakers.map((sp: any) => (
                  <div key={sp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            gap: 12, padding: '10px 12px', borderRadius: 8,
                                            border: '1px solid var(--pz-border)' }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>{sp.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--pz-muted)', margin: 0 }}>
                        {[sp.job_title, sp.company].filter(Boolean).join(', ')}
                        {sp.times_spoken > 0 && ` · Spoken ${sp.times_spoken}×`}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <button
                        onClick={() => addFromLib(sp.id)}
                        disabled={libAdding === sp.id}
                        style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6,
                                 background: 'var(--pz-teal)', color: 'var(--pz-surface)', border: 'none',
                                 cursor: 'pointer', opacity: libAdding === sp.id ? 0.6 : 1 }}
                      >
                        {libAdding === sp.id ? 'Adding…' : 'Add to event'}
                      </button>
                      {libResult[sp.id] && (
                        <p style={{ fontSize: 11, marginTop: 2,
                                    color: libResult[sp.id] === 'Added!' ? 'var(--pz-success)' : 'var(--pz-error, var(--pz-error))' }}>
                          {libResult[sp.id]}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add speaker form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="pz-card p-4 space-y-3">
          <h3 className="font-medium text-sm" style={{ color: 'var(--pz-text)' }}>New Speaker</h3>
          {addError && <p className="text-xs" style={{ color: 'var(--pz-error, var(--pz-error))' }}>{addError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" htmlFor="spk-name" required>
              <input id="spk-name" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                className="w-full rounded-lg px-3 py-2 text-sm border" style={{ background: 'var(--pz-surface)', borderColor: 'var(--pz-border)', color: 'var(--pz-text)' }} />
            </Field>
            <Field label="Email" htmlFor="spk-email">
              <input id="spk-email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}
                type="email" className="w-full rounded-lg px-3 py-2 text-sm border" style={{ background: 'var(--pz-surface)', borderColor: 'var(--pz-border)', color: 'var(--pz-text)' }} />
            </Field>
            <Field label="Job title" htmlFor="spk-job-title">
              <input id="spk-job-title" value={form.job_title} onChange={e => setForm(f => ({...f, job_title: e.target.value}))}
                className="w-full rounded-lg px-3 py-2 text-sm border" style={{ background: 'var(--pz-surface)', borderColor: 'var(--pz-border)', color: 'var(--pz-text)' }} />
            </Field>
            <Field label="Company" htmlFor="spk-company">
              <input id="spk-company" value={form.company} onChange={e => setForm(f => ({...f, company: e.target.value}))}
                className="w-full rounded-lg px-3 py-2 text-sm border" style={{ background: 'var(--pz-surface)', borderColor: 'var(--pz-border)', color: 'var(--pz-text)' }} />
            </Field>
          </div>
          <Field label="Event role" htmlFor="spk-event-role">
            <select id="spk-event-role" value={form.event_role} onChange={e => setForm(f => ({...f, event_role: e.target.value}))}
              className="w-full rounded-lg px-3 py-2 text-sm border" style={{ background: 'var(--pz-surface)', borderColor: 'var(--pz-border)', color: 'var(--pz-text)' }}>
              <option value="speaker">Speaker</option>
              <option value="mc">MC / Emcee</option>
              <option value="chair">Program Chair</option>
              <option value="host">Host</option>
              <option value="guest">Guest</option>
              <option value="vip">VIP</option>
            </select>
          </Field>
          <Field label="Bio" htmlFor="spk-bio">
            <textarea id="spk-bio" value={form.bio} onChange={e => setForm(f => ({...f, bio: e.target.value}))} rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm border" style={{ background: 'var(--pz-surface)', borderColor: 'var(--pz-border)', color: 'var(--pz-text)', resize: 'vertical' }} />
          </Field>
          <div className="flex gap-2 justify-end">
            <button type="submit" disabled={adding}
              className="rounded-lg px-4 py-2 text-sm font-medium"
              style={{ background: 'var(--pz-teal)', color: 'var(--pz-surface)', opacity: adding ? 0.6 : 1 }}>
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
                    style={{ background: badge.bg, color: 'var(--pz-surface)' }}>{badge.label}</span>
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
                    &ldquo;{sp.decline_reason}&rdquo;
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
                  style={{ background: 'var(--pz-teal)', color: 'var(--pz-surface)', opacity: !sp.email ? 0.5 : 1 }}>
                  {inviting === sp.id ? 'Sending…' : 'Send invite'}
                </button>
                <button
                  onClick={async () => {
                    const result = await renewSpeakerToken(sp.id)
                    if ((result as any).ok) {
                      await navigator.clipboard.writeText((result as any).hubUrl)
                      setInviteResult(prev => ({ ...prev, [sp.id]: 'New link copied to clipboard!' }))
                    }
                  }}
                  style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6,
                           border: '1px solid var(--pz-border)', color: 'var(--pz-muted)',
                           background: 'transparent', cursor: 'pointer' }}
                  title="Generate a new portal link and resend invite email"
                >
                  ↻ Renew link
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

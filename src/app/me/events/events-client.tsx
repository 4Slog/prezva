'use client'

import { useState } from 'react'
import Link from 'next/link'
import CancelRegistrationButton from '@/components/registration/cancel-button'
import { useRouter } from 'next/navigation'
import { transferRegistration } from '@/lib/registration/transfer-actions'

interface Reg {
  id: string
  status: string
  amount_paid_cents: number | null
  ticket_types?: { name: string } | null
  events?: {
    title?: string
    slug?: string
    start_at?: string
    end_at?: string
    is_virtual?: boolean
    venue_name?: string
  } | null
}

type Tab = 'upcoming' | 'past' | 'cancelled'

interface Props {
  groups: Record<Tab, Reg[]>
  active: Tab
}

interface TransferState {
  regId: string
  eventTitle: string
}

export default function MyEventsClient({ groups, active }: Props) {
  const router = useRouter()
  const list = groups[active] ?? []
  const now = new Date()
  const [transfer, setTransfer] = useState<TransferState | null>(null)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' })
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)
  const [err, setErr] = useState('')

  function openTransfer(reg: Reg) {
    setTransfer({ regId: reg.id, eventTitle: reg.events?.title ?? 'this event' })
    setForm({ firstName: '', lastName: '', email: '' })
    setSuccess(false)
    setErr('')
  }

  function closeTransfer() {
    setTransfer(null)
    setSuccess(false)
    setErr('')
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault()
    if (!transfer) return
    setBusy(true)
    setErr('')
    const result = await transferRegistration(transfer.regId, form.firstName, form.lastName, form.email)
    setBusy(false)
    if (result.error) { setErr(result.error); return }
    setSuccess(true)
    router.refresh()
  }

  return (
    <>
      {list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--pz-muted)', fontSize: 14 }}>
          No {active} events.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map((reg) => {
            const ev = reg.events
            const date = ev?.start_at ? new Date(ev.start_at) : null
            const endDate = ev?.end_at ? new Date(ev.end_at as string) : null
            const canCancel = date && date > now && ['confirmed', 'waitlisted'].includes(reg.status)
            const canTransfer = date && date > now && reg.status === 'confirmed'
            return (
              <div key={reg.id} style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.25rem', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {date && (
                  <div style={{ minWidth: 52, textAlign: 'center', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 8, padding: '6px 4px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--pz-teal)', textTransform: 'uppercase', letterSpacing: 1 }}>
                      {date.toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--pz-text)', lineHeight: 1.1 }}>
                      {date.getDate()}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--pz-muted)' }}>
                      {date.getFullYear()}
                    </div>
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 4 }}>{ev?.title ?? 'Event'}</p>
                  <p style={{ fontSize: 12, color: 'var(--pz-muted)', marginBottom: 6 }}>
                    {ev?.is_virtual ? 'Virtual event' : ev?.venue_name ?? 'TBA'}
                    {date && endDate ? ` · ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {reg.ticket_types?.name && (
                      <span style={{ fontSize: 11, background: 'var(--pz-teal)22', color: 'var(--pz-teal)', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>
                        {reg.ticket_types.name}
                      </span>
                    )}
                    <span style={{ fontSize: 11, background: reg.status === 'confirmed' ? '#22c55e22' : 'var(--pz-border)', color: reg.status === 'confirmed' ? '#22c55e' : 'var(--pz-muted)', padding: '2px 8px', borderRadius: 4, fontWeight: 500, textTransform: 'capitalize' }}>
                      {reg.status}
                    </span>
                    {canTransfer && (
                      <button
                        onClick={() => openTransfer(reg)}
                        style={{ fontSize: 11, background: 'transparent', border: '1px solid var(--pz-border)', color: 'var(--pz-muted)', padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}
                      >
                        Transfer
                      </button>
                    )}
                    {canCancel && (
                      <CancelRegistrationButton
                        registrationId={reg.id}
                        eventTitle={ev?.title ?? ''}
                        isPaid={(reg.amount_paid_cents ?? 0) > 0}
                        onCancelled={() => router.refresh()}
                      />
                    )}
                  </div>
                </div>
                {ev?.slug && (
                  <Link
                    href={`/e/${ev.slug}`}
                    style={{ fontSize: 13, color: 'var(--pz-teal)', textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}
                  >
                    View event →
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Transfer modal */}
      {transfer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 12, padding: 28, width: '100%', maxWidth: 420 }}>
            {success ? (
              <>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  <p style={{ color: 'var(--pz-text)', fontWeight: 600 }}>Ticket transferred</p>
                  <p style={{ color: 'var(--pz-muted)', fontSize: 13, marginTop: 4 }}>Confirmation emails have been sent.</p>
                </div>
                <button onClick={closeTransfer} style={{ width: '100%', background: 'var(--pz-teal)', color: '#0D1B2A', border: 'none', borderRadius: 8, padding: '10px 0', fontWeight: 600, cursor: 'pointer' }}>
                  Done
                </button>
              </>
            ) : (
              <>
                <h3 style={{ color: 'var(--pz-text)', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Transfer ticket</h3>
                <p style={{ color: 'var(--pz-muted)', fontSize: 13, marginBottom: 20 }}>
                  Transfer your ticket for <strong style={{ color: 'var(--pz-text)' }}>{transfer.eventTitle}</strong> to someone else.
                </p>
                <form onSubmit={handleTransfer} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, color: 'var(--pz-muted)', display: 'block', marginBottom: 4 }}>First name</label>
                      <input
                        required
                        value={form.firstName}
                        onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                        style={{ width: '100%', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '8px 10px', color: 'var(--pz-text)', fontSize: 13, boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, color: 'var(--pz-muted)', display: 'block', marginBottom: 4 }}>Last name</label>
                      <input
                        required
                        value={form.lastName}
                        onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                        style={{ width: '100%', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '8px 10px', color: 'var(--pz-text)', fontSize: 13, boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--pz-muted)', display: 'block', marginBottom: 4 }}>Email address</label>
                    <input
                      required
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      style={{ width: '100%', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '8px 10px', color: 'var(--pz-text)', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                  {err && <p style={{ color: '#ef4444', fontSize: 12 }}>{err}</p>}
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button type="button" onClick={closeTransfer} style={{ flex: 1, background: 'transparent', border: '1px solid var(--pz-border)', color: 'var(--pz-muted)', borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontSize: 13 }}>
                      Cancel
                    </button>
                    <button type="submit" disabled={busy} style={{ flex: 1, background: 'var(--pz-teal)', color: '#0D1B2A', border: 'none', borderRadius: 8, padding: '10px 0', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', fontSize: 13, opacity: busy ? 0.7 : 1 }}>
                      {busy ? 'Transferring…' : 'Transfer ticket'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

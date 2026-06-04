'use client'

import { useState } from 'react'
import { transferRegistration } from '@/lib/registration/transfer-actions'

interface Props {
  registrationId: string
  eventTitle: string
}

export default function TransferButton({ registrationId, eventTitle }: Props) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' })
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const result = await transferRegistration(registrationId, form.firstName, form.lastName, form.email)
    setBusy(false)
    if (result.error) { setErr(result.error); return }
    setSuccess(true)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--pz-muted)', textDecoration: 'underline', padding: 0 }}
      >
        Transfer ticket
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 12, padding: 28, width: '100%', maxWidth: 400 }}>
            {success ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <p style={{ color: 'var(--pz-text)', fontWeight: 600, marginBottom: 4 }}>Ticket transferred</p>
                <p style={{ color: 'var(--pz-muted)', fontSize: 13, marginBottom: 20 }}>Confirmation emails have been sent.</p>
                <button onClick={() => setOpen(false)} style={{ background: 'var(--pz-teal)', color: '#0D1B2A', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            ) : (
              <>
                <h3 style={{ color: 'var(--pz-text)', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Transfer ticket</h3>
                <p style={{ color: 'var(--pz-muted)', fontSize: 13, marginBottom: 20 }}>
                  Transfer your ticket for <strong style={{ color: 'var(--pz-text)' }}>{eventTitle}</strong> to someone else.
                </p>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, color: 'var(--pz-muted)', display: 'block', marginBottom: 4 }}>First name</label>
                      <input required value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                        style={{ width: '100%', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '8px 10px', color: 'var(--pz-text)', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, color: 'var(--pz-muted)', display: 'block', marginBottom: 4 }}>Last name</label>
                      <input required value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                        style={{ width: '100%', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '8px 10px', color: 'var(--pz-text)', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--pz-muted)', display: 'block', marginBottom: 4 }}>Email address</label>
                    <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      style={{ width: '100%', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '8px 10px', color: 'var(--pz-text)', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  {err && <p style={{ color: 'var(--pz-error)', fontSize: 12 }}>{err}</p>}
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button type="button" onClick={() => setOpen(false)} style={{ flex: 1, background: 'transparent', border: '1px solid var(--pz-border)', color: 'var(--pz-muted)', borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontSize: 13 }}>
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

'use client'

import { useState } from 'react'
import { selfCancelRegistration } from '@/lib/registrations/actions'

interface Props {
  registrationId: string
  eventTitle: string
  isPaid: boolean
  onCancelled?: () => void
}

export default function CancelRegistrationButton({ registrationId, eventTitle, isPaid, onCancelled }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setLoading(true)
    const result = await selfCancelRegistration(registrationId)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setDone(true)
      onCancelled?.()
    }
  }

  if (done) {
    return (
      <span style={{ fontSize: 12, color: 'var(--pz-muted)' }}>
        {isPaid ? 'Cancellation requested' : 'Cancelled'}
      </span>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{ fontSize: 12, color: 'var(--pz-error)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
      >
        Cancel registration
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: 12, padding: 28, maxWidth: 420, width: '100%' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 12 }}>Cancel registration?</h2>
            <p style={{ fontSize: 14, color: 'var(--pz-muted)', marginBottom: isPaid ? 12 : 20 }}>
              Cancel your registration for <strong style={{ color: 'var(--pz-text)' }}>{eventTitle}</strong>?
            </p>
            {isPaid && (
              <p style={{ fontSize: 13, color: 'var(--pz-warning-fill)', marginBottom: 20 }}>
                For paid tickets, refunds are processed per the organizer&apos;s policy. You will receive a cancellation request confirmation.
              </p>
            )}
            {error && <p style={{ fontSize: 13, color: 'var(--pz-error)', marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--pz-border)', background: 'none', color: 'var(--pz-muted)', cursor: 'pointer' }}
              >
                Keep registration
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--pz-error)', color: 'var(--pz-surface)', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Cancelling…' : 'Yes, cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

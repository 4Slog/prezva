'use client'
import { useState, useTransition } from 'react'
import { refundRegistration, resendConfirmation, cancelRegistration, manualCheckIn } from '@/lib/registrations/actions'

interface Props {
  registrationId: string
  status: string
  amountPaidCents: number | null
  stripeChargeId: string | null
}

export function AttendeeActions({ registrationId, status, amountPaidCents, stripeChargeId }: Props) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function run(action: () => Promise<{ ok?: boolean; error?: string; [k: string]: any }>) {
    setMessage(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) setMessage({ text: result.error, ok: false })
      else setMessage({ text: 'Done.', ok: true })
      setConfirming(null)
    })
  }

  const btnBase = 'px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-50'
  const btnDanger = btnBase + ' bg-red-50 border-red-300 text-red-700'
  const btnNeutral = btnBase + ' bg-[var(--pz-surface)] border-[var(--pz-border)] text-[var(--pz-text)]'
  const btnTeal = btnBase + ' bg-[var(--pz-teal)]20 border-[var(--pz-teal)] text-[var(--pz-teal)]'

  const canRefund = status === 'confirmed' && (amountPaidCents ?? 0) > 0 && !!stripeChargeId

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {/* Manual check-in */}
        <button
          className={btnTeal}
          onClick={() => run(() => manualCheckIn(registrationId))}
          disabled={status === 'cancelled' || status === 'refunded'}
        >
          Manual Check-In
        </button>

        {/* Resend confirmation */}
        <button
          className={btnNeutral}
          onClick={() => run(() => resendConfirmation(registrationId))}
          disabled={status === 'cancelled' || status === 'refunded'}
        >
          Resend Confirmation
        </button>

        {/* Cancel */}
        {status !== 'cancelled' && status !== 'refunded' && (
          confirming === 'cancel' ? (
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12 }}>Confirm cancel?</span>
              <button className={btnDanger} onClick={() => run(() => cancelRegistration(registrationId))}>Yes</button>
              <button className={btnNeutral} onClick={() => setConfirming(null)}>No</button>
            </span>
          ) : (
            <button className={btnDanger} onClick={() => setConfirming('cancel')}>Cancel Registration</button>
          )
        )}

        {/* Refund */}
        {canRefund && (
          confirming === 'refund' ? (
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12 }}>Refund ${((amountPaidCents ?? 0) / 100).toFixed(2)}?</span>
              <button className={btnDanger} onClick={() => run(() => refundRegistration(registrationId))}>Yes, Refund</button>
              <button className={btnNeutral} onClick={() => setConfirming(null)}>No</button>
            </span>
          ) : (
            <button className={btnDanger} onClick={() => setConfirming('refund')}>
              Refund ${((amountPaidCents ?? 0) / 100).toFixed(2)}
            </button>
          )
        )}
      </div>

      {message && (
        <p style={{ fontSize: 12, color: message.ok ? 'var(--pz-teal)' : '#EF4444' }}>{message.text}</p>
      )}
    </div>
  )
}

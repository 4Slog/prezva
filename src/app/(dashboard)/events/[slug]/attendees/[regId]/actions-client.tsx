'use client'
import { useState, useTransition } from 'react'
import { refundRegistration, resendConfirmation, cancelRegistration, manualCheckIn, undoCheckIn } from '@/lib/registrations/actions'

interface Props {
  registrationId: string
  status: string
  amountPaidCents: number | null
  stripeChargeId: string | null
}

export function AttendeeActions({ registrationId, status, amountPaidCents, stripeChargeId }: Props) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [checkedIn, setCheckedIn] = useState(status === 'checked_in')
  const [, startTransition] = useTransition()

  function run(
    action: () => Promise<{ ok?: boolean; error?: string; alreadyCheckedIn?: boolean; [k: string]: any }>,
    onSuccess?: (result: any) => void
  ) {
    setMessage(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        setMessage({ text: result.error, ok: false })
      } else {
        onSuccess?.(result)
        setConfirming(null)
      }
    })
  }

  const btnBase = 'px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed'
  const btnDanger = btnBase + ' bg-red-50 border-red-300 text-red-700'
  const btnNeutral = btnBase + ' bg-[var(--pz-surface)] border-[var(--pz-border)] text-[var(--pz-text)]'
  const btnTeal = btnBase + ' bg-[var(--pz-teal)]20 border-[var(--pz-teal)] text-[var(--pz-teal)]'
  const btnSuccess = btnBase + ' bg-green-50 border-green-400 text-green-700 cursor-default'

  const canRefund = status === 'confirmed' && (amountPaidCents ?? 0) > 0 && !!stripeChargeId
  const isInactive = status === 'cancelled' || status === 'refunded'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>

        {/* Manual check-in — shows success state, cannot be clicked again */}
        {checkedIn ? (
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className={btnSuccess} disabled>
              ✓ Checked In
            </button>
            {confirming === 'undo-checkin' ? (
              <>
                <span style={{ fontSize: 12, color: 'var(--pz-muted)' }}>Undo check-in?</span>
                <button className={btnDanger} onClick={() => run(
                  () => undoCheckIn(registrationId),
                  () => { setCheckedIn(false); setMessage({ text: 'Check-in undone.', ok: true }) }
                )}>Yes, undo</button>
                <button className={btnNeutral} onClick={() => setConfirming(null)}>Cancel</button>
              </>
            ) : (
              <button
                className={btnNeutral}
                style={{ fontSize: 11, padding: '2px 8px', opacity: 0.6 }}
                onClick={() => setConfirming('undo-checkin')}
              >
                Undo
              </button>
            )}
          </span>
        ) : (
          <button
            className={btnTeal}
            onClick={() => run(
              () => manualCheckIn(registrationId),
              (result) => {
                if (result.ok) {
                  setCheckedIn(true)
                  if (result.alreadyCheckedIn) {
                    setMessage({ text: 'Already checked in.', ok: true })
                  }
                }
              }
            )}
            disabled={isInactive}
          >
            Manual Check-In
          </button>
        )}

        {/* Resend confirmation */}
        <button
          className={btnNeutral}
          onClick={() => run(
            () => resendConfirmation(registrationId),
            () => setMessage({ text: 'Confirmation email sent.', ok: true })
          )}
          disabled={isInactive}
        >
          Resend Confirmation
        </button>

        {/* Cancel */}
        {status !== 'cancelled' && status !== 'refunded' && (
          confirming === 'cancel' ? (
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12 }}>Confirm cancel?</span>
              <button className={btnDanger} onClick={() => run(
                () => cancelRegistration(registrationId),
                () => setMessage({ text: 'Registration cancelled.', ok: true })
              )}>Yes</button>
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
              <button className={btnDanger} onClick={() => {
                setMessage(null)
                startTransition(async () => {
                  const result = await refundRegistration(registrationId)
                  if (result.error) {
                    setMessage({ text: result.error, ok: false })
                  } else if (result.warning === 'checked_in') {
                    setConfirming('refund_checked_in')
                  } else {
                    setMessage({ text: 'Refund processed.', ok: true })
                    setConfirming(null)
                  }
                })
              }}>Yes, Refund</button>
              <button className={btnNeutral} onClick={() => setConfirming(null)}>No</button>
            </span>
          ) : confirming === 'refund_checked_in' ? (
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12 }}>This attendee has already checked in. Are you sure you want to issue a refund?</span>
              <button className={btnDanger} onClick={() => run(
                () => refundRegistration(registrationId, true),
                () => setMessage({ text: 'Refund processed.', ok: true })
              )}>Yes, refund anyway</button>
              <button className={btnNeutral} onClick={() => setConfirming(null)}>Cancel</button>
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

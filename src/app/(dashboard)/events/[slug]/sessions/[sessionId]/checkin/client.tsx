'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Check, AlertTriangle, X, Copy, CheckCheck } from 'lucide-react'
import { QRScanner } from '@/components/checkin/QRScanner'
import { orgCheckInToSession } from '@/lib/checkin/actions'
import type { CheckInResult, SessionAttendeeRow } from '@/lib/checkin/actions'
import QRDisplay from '@/app/e/[slug]/my-qr/qr-display'

type Tab = 'scan' | 'attendees' | 'session-qr'

interface Props {
  eventId: string
  sessionId: string
  sessionTitle: string
  sessionUrl: string
  initialAttendees: SessionAttendeeRow[]
}

export default function SessionCheckInClient({
  eventId,
  sessionId,
  sessionTitle,
  sessionUrl,
  initialAttendees,
}: Props) {
  const [tab, setTab] = useState<Tab>('scan')
  const [attendees, setAttendees] = useState<SessionAttendeeRow[]>(initialAttendees)
  const [lastResult, setLastResult] = useState<CheckInResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [copied, setCopied] = useState(false)
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const checkedInCount = attendees.filter(a => a.checked_in).length

  function applyCheckIn(registrationId: string, checkedInAt: string) {
    setAttendees(prev =>
      prev.map(a =>
        a.registration_id === registrationId
          ? { ...a, checked_in: true, checked_in_at: checkedInAt }
          : a
      )
    )
  }

  function showResult(result: CheckInResult) {
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
    setLastResult(result)
    resultTimerRef.current = setTimeout(() => setLastResult(null), 3000)
  }

  useEffect(() => () => { if (resultTimerRef.current) clearTimeout(resultTimerRef.current) }, [])

  const handleQRScan = useCallback(async (code: string) => {
    if (scanning) return
    setScanning(true)
    const result = await orgCheckInToSession(eventId, sessionId, code.toLowerCase(), 'qr_scan')
    showResult(result)
    if (result.success && result.registration && !result.registration.already_checked_in) {
      applyCheckIn(result.registration.id, new Date().toISOString())
    }
    setScanning(false)
  }, [eventId, sessionId, scanning])

  async function handleManualToggle(registrationId: string, currentlyCheckedIn: boolean) {
    if (currentlyCheckedIn) return
    const result = await orgCheckInToSession(eventId, sessionId, registrationId, 'manual')
    showResult(result)
    if (result.success && result.registration) {
      applyCheckIn(registrationId, new Date().toISOString())
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(sessionUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'scan', label: 'Scan QR' },
    { id: 'attendees', label: `Attendees (${checkedInCount}/${attendees.length})` },
    { id: 'session-qr', label: 'Session QR' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--pz-text)' }}>{sessionTitle}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--pz-muted)' }}>
          Session check-in — {checkedInCount}/{attendees.length} checked in
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-[var(--pz-bg)] p-1 rounded-lg">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              'flex-1 py-2 text-sm font-medium rounded-md transition-colors ' +
              (tab === t.id
                ? 'bg-[var(--pz-surface)] text-[var(--pz-text)] shadow-sm'
                : 'text-[var(--pz-muted)] hover:text-[var(--pz-text)]')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Scan result toast */}
      {lastResult && (
        <div className={
          'p-4 rounded-xl border text-sm font-medium ' +
          (lastResult.success
            ? lastResult.registration?.already_checked_in
              ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
              : 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800')
        }>
          {lastResult.success && lastResult.registration ? (
            lastResult.registration.already_checked_in ? (
              <span className="flex items-center gap-1">
                <AlertTriangle size={14} /> {lastResult.registration.attendee_name} already checked in to this session
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Check size={14} /> {lastResult.registration.attendee_name} checked in
              </span>
            )
          ) : (
            <span className="flex items-center gap-1"><X size={14} /> {lastResult.error}</span>
          )}
        </div>
      )}

      {/* Tab content */}
      {tab === 'scan' && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
            Scan an attendee badge QR code to check them into this session.
          </p>
          <QRScanner onScan={handleQRScan} active={tab === 'scan'} />
        </div>
      )}

      {tab === 'attendees' && (
        <div className="space-y-2">
          {attendees.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: 'var(--pz-muted)' }}>
              No confirmed registrations yet.
            </p>
          )}
          {attendees.map(a => (
            <div
              key={a.registration_id}
              className="flex items-center justify-between p-3 rounded-lg"
              style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)' }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--pz-text)' }}>
                  {a.attendee_name}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--pz-muted)' }}>
                  {a.ticket_name}
                  {a.checked_in && a.checked_in_at && (
                    <> · {new Date(a.checked_in_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</>
                  )}
                </p>
              </div>
              <button
                onClick={() => handleManualToggle(a.registration_id, a.checked_in)}
                disabled={a.checked_in}
                className="flex-shrink-0 ml-3 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={
                  a.checked_in
                    ? { background: 'var(--pz-success-bg, #f0fdf4)', color: 'var(--pz-success-text, #16a34a)', border: '1px solid var(--pz-success-border, #bbf7d0)', cursor: 'default' }
                    : { background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', cursor: 'pointer' }
                }
              >
                {a.checked_in ? <><CheckCheck size={12} /> Checked in</> : 'Mark in'}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'session-qr' && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
            Attendees can scan this QR code to self-check-in to this session.
          </p>
          <div className="flex justify-center">
            <QRDisplay qrCode={sessionUrl} />
          </div>
          <div
            className="flex items-center gap-2 p-3 rounded-lg"
            style={{ background: 'var(--pz-bg)', border: '1px solid var(--pz-border)' }}
          >
            <p
              className="flex-1 text-xs font-mono truncate"
              style={{ color: 'var(--pz-muted)' }}
            >
              {sessionUrl}
            </p>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', cursor: 'pointer' }}
            >
              {copied ? <><CheckCheck size={12} /> Copied</> : <><Copy size={12} /> Copy URL</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

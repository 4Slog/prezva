'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { AlertTriangle, Check, X, Copy, CheckCheck, Clock } from 'lucide-react'
import { QRScanner } from '@/components/checkin/QRScanner'
import { ManualSearch } from '@/components/checkin/ManualSearch'
import { CheckInDashboard } from '@/components/checkin/CheckInDashboard'
import { checkInByQR, checkInBySearch, getCheckInStats } from '@/lib/checkin/actions'
import type { CheckInResult, CheckInStats } from '@/lib/checkin/actions'
import { syncPending } from '@/lib/checkin/offline-db'
import { useDoorQueue } from '@/components/checkin/useDoorQueue'
import { OfflineQueueStatus, NeedsAttentionList, MANUAL_CHECKIN_FAILED } from '@/components/checkin/OfflineQueuePanel'
import { Gated } from '@/components/auth/Gated'
import QRDisplay from '@/app/e/[slug]/my-qr/qr-display'

function KioskClock() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(t)
  }, [])
  return <span>{time}</span>
}

interface VolunteerStatus {
  total: number
  checked_in: number
  clocked_in_names: string[]
}

interface CheckInClientProps {
  eventId: string
  eventName: string
  initialStats: CheckInStats
  volunteerStatus?: VolunteerStatus | null
  permissions: string[]
  eventSelfCheckInUrl?: string
}

type Tab = 'qr' | 'search' | 'stats' | 'arrival-qr'

export function CheckInClient({ eventId, eventName, initialStats, volunteerStatus, permissions, eventSelfCheckInUrl }: CheckInClientProps) {
  const canCheckIn = permissions.includes('*') || permissions.includes('checkin.manage')
  const [tab, setTab] = useState<Tab>('qr')
  const [stats, setStats] = useState<CheckInStats>(initialStats)
  const [lastResult, setLastResult] = useState<CheckInResult | null>(null)
  // R84: a scan saved to the offline queue. Never an accepted check-in.
  const [queued, setQueued] = useState(false)
  const [scanning, setScanning] = useState(false)
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [kioskMode, setKioskMode] = useState(false)
  const [escCount, setEscCount] = useState(0)
  const escTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [urlCopied, setUrlCopied] = useState(false)

  const refreshStats = useCallback(async () => {
    try {
      setStats(await getCheckInStats(eventId))
    } catch {
      // Offline or a failed refresh: keep the last stats.
    }
  }, [eventId])

  const { isOnline, pendingCount, needsAttention, syncing, triggerSync, queueScan, dismiss } =
    useDoorQueue(eventId, syncPending, refreshStats)

  // Kiosk: auto-reset 30s after successful check-in
  useEffect(() => {
    if (!kioskMode || !lastResult?.success) return
    const t = setTimeout(() => {
      setLastResult(null)
      setTab('qr')
    }, 30000)
    return () => clearTimeout(t)
  }, [kioskMode, lastResult])

  // Kiosk: Esc ×3 to exit
  useEffect(() => {
    if (!kioskMode) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setEscCount(n => {
        const next = n + 1
        if (next >= 3) {
          setKioskMode(false)
          setEscCount(0)
          return 0
        }
        if (escTimerRef.current) clearTimeout(escTimerRef.current)
        escTimerRef.current = setTimeout(() => setEscCount(0), 3000)
        return next
      })
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [kioskMode])

  const handleQRScan = useCallback(async (code: string) => {
    if (scanning) return
    setScanning(true)

    const normalizedCode = code.toLowerCase()
    const queue = async () => {
      await queueScan(normalizedCode)
      setLastResult(null)
      setQueued(true)
    }

    try {
      if (!navigator.onLine) {
        await queue()
        return
      }
      let result: CheckInResult
      try {
        result = await checkInByQR(eventId, normalizedCode)
      } catch {
        // The call itself failed (network down, or connected with no internet):
        // queue it. A returned { success: false } is a real refusal, shown below.
        await queue()
        return
      }
      setLastResult(result)
      if (result.success) await refreshStats()
    } catch (e) {
      console.error('[checkin] could not queue scan:', e)
      setLastResult({ success: false, error: 'Scan not saved — try again' })
    } finally {
      scanTimeoutRef.current = setTimeout(() => { setLastResult(null); setQueued(false); setScanning(false) }, 3000)
    }
  }, [eventId, scanning, refreshStats, queueScan])

  const handleManualCheckIn = useCallback(async (registrationId: string) => {
    // A thrown call (no network) shows an error; the name search never freezes.
    // Door manual check-in is not queued offline.
    let result: CheckInResult
    try {
      result = await checkInBySearch(eventId, registrationId)
    } catch (e) {
      console.error('[checkin] manual check-in failed:', e)
      result = { success: false, error: MANUAL_CHECKIN_FAILED }
    }
    setLastResult(result)
    setTimeout(() => setLastResult(null), 3000)
    if (result.success) {
      try { await refreshStats() } catch (e) { console.error('[checkin] stats refresh failed:', e) }
    }
  }, [eventId, refreshStats])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'qr', label: 'QR Scanner' },
    { id: 'search', label: 'Name Search' },
    { id: 'stats', label: 'Dashboard' },
    ...(eventSelfCheckInUrl ? [{ id: 'arrival-qr' as Tab, label: 'Arrival QR' }] : []),
  ]

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--pz-text)]">{eventName}</h1>
          <p className="text-sm text-[var(--pz-muted)] mt-1">
            Check-In — {stats.total_checked_in}/{stats.total_registered} attendees checked in
          </p>
        </div>
        {/* Offline sync widget */}
        <OfflineQueueStatus
          isOnline={isOnline}
          pendingCount={pendingCount}
          needsAttentionCount={needsAttention.length}
          syncing={syncing}
          onSync={triggerSync}
        />
      </div>

      {/* Offline banner */}
      {!isOnline && (
        <div className="p-3 rounded-lg text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 font-medium">
          Offline — scans will be queued and synced when reconnected
        </div>
      )}

      <NeedsAttentionList entries={needsAttention} onDismiss={dismiss} />

      {/* Tab switcher + kiosk button */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1 bg-[var(--pz-bg)] p-1 rounded-lg">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                'flex-1 py-2 text-sm font-medium rounded-md transition-colors ' +
                (tab === t.id
                  ? 'bg-[var(--pz-surface)] text-[var(--pz-text)] shadow-sm'
                  : 'text-[var(--pz-muted)] hover:text-[var(--pz-muted)]')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <Gated permission="checkin.manage" perms={permissions} mode="disable">
          <button
            type="button"
            onClick={() => setKioskMode(true)}
            className="flex-shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
            style={{ borderColor: 'var(--pz-teal)', color: 'var(--pz-teal-ink)', background: 'none' }}
            title="Enter fullscreen kiosk mode"
          >
            Kiosk mode
          </button>
        </Gated>
      </div>

      {/* Queued scan: distinct from a check-in, no attendee shown */}
      {queued && (
        <div className="p-4 rounded-xl border text-sm font-medium bg-blue-50 border-blue-200 text-blue-800">
          <span className="flex items-center gap-1"><Clock size={14} /> Queued — will sync</span>
        </div>
      )}

      {/* Scan result toast */}
      {lastResult && (
        <div className={
          'p-4 rounded-xl border text-sm font-medium transition-all ' +
          (lastResult.success
            ? lastResult.registration?.already_checked_in
              ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
              : 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800')
        }>
          {lastResult.success && lastResult.registration ? (
            lastResult.registration.already_checked_in ? (
              <span className="flex items-center gap-1"><AlertTriangle size={14} /> {lastResult.registration.attendee_name} already checked in</span>
            ) : (
              <span className="flex items-center gap-1">
                <Check size={14} /> {lastResult.registration.attendee_name} checked in — {lastResult.registration.ticket_name}
                {!!lastResult.points_awarded && lastResult.points_awarded > 0 && (
                  <strong className="ml-1">+{lastResult.points_awarded} points!</strong>
                )}
              </span>
            )
          ) : (
            <span className="flex items-center gap-1"><X size={14} /> {lastResult.error}</span>
          )}
        </div>
      )}

      {/* Tab content */}
      <div>
        {tab === 'qr' && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--pz-muted)]">
              Point the camera at an attendee&apos;s QR code to check them in.
            </p>
            {canCheckIn ? (
              <QRScanner onScan={handleQRScan} active={tab === 'qr'} />
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--pz-muted)', fontSize: 13, border: '1px solid var(--pz-border)', borderRadius: 8 }}>
                You don&apos;t have permission to check in attendees.
              </div>
            )}
          </div>
        )}
        {tab === 'search' && (
          canCheckIn ? (
            <ManualSearch eventId={eventId} onCheckIn={handleManualCheckIn} />
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--pz-muted)', fontSize: 13, border: '1px solid var(--pz-border)', borderRadius: 8 }}>
              You don&apos;t have permission to check in attendees.
            </div>
          )
        )}
        {tab === 'stats' && (
          <CheckInDashboard stats={stats} onRefresh={refreshStats} volunteerStatus={volunteerStatus} />
        )}
        {tab === 'arrival-qr' && eventSelfCheckInUrl && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
              Display this QR code at your arrival area. Attendees scan it to self-check-in using their confirmation email and PIN.
            </p>
            <div className="flex justify-center">
              <QRDisplay qrCode={eventSelfCheckInUrl} />
            </div>
            <div
              className="flex items-center gap-2 p-3 rounded-lg"
              style={{ background: 'var(--pz-bg)', border: '1px solid var(--pz-border)' }}
            >
              <p className="flex-1 text-xs font-mono truncate" style={{ color: 'var(--pz-muted)' }}>
                {eventSelfCheckInUrl}
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(eventSelfCheckInUrl).then(() => {
                    setUrlCopied(true)
                    setTimeout(() => setUrlCopied(false), 2000)
                  })
                }}
                className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', cursor: 'pointer' }}
              >
                {urlCopied ? <><CheckCheck size={12} /> Copied</> : <><Copy size={12} /> Copy URL</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Kiosk overlay */}
      {kioskMode && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'var(--pz-chrome)', color: 'var(--pz-chrome-text)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '2rem',
            overflowY: 'auto',
          }}
        >
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.25rem' }}>{eventName}</h1>
            <p style={{ fontSize: '1.25rem', color: 'var(--pz-chrome-muted)' }}>
              <KioskClock /> &nbsp;·&nbsp; {stats.total_checked_in}/{stats.total_registered} checked in
            </p>
          </div>

          {/* Queued scan */}
          {queued && (
            <div
              style={{
                width: '100%', maxWidth: 560, marginBottom: '1rem',
                padding: '1rem', borderRadius: 12, textAlign: 'center',
                fontSize: '1.1rem', fontWeight: 600,
                border: '1px dashed var(--pz-chrome-muted)', color: 'var(--pz-chrome-text)',
              }}
            >
              Queued — will sync
            </div>
          )}

          {/* Check-in result */}
          {lastResult && (
            <div
              style={{
                width: '100%', maxWidth: 560, marginBottom: '1rem',
                padding: '1rem', borderRadius: 12, textAlign: 'center',
                fontSize: '1.1rem', fontWeight: 600,
                ...(lastResult.success
                  ? lastResult.registration?.already_checked_in
                    // eslint-disable-next-line no-restricted-syntax
                    ? { background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#FCD34D' }
                    : { background: 'rgba(0,191,166,0.15)', border: '1px solid rgba(0,191,166,0.4)', color: 'var(--pz-teal)' }
                  // eslint-disable-next-line no-restricted-syntax
                  : { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#FCA5A5' }),
              }}
            >
              {lastResult.success && lastResult.registration ? (
                lastResult.registration.already_checked_in
                  ? `Already checked in: ${lastResult.registration.attendee_name}`
                  : `Checked in: ${lastResult.registration.attendee_name} — ${lastResult.registration.ticket_name}${
                      lastResult.points_awarded && lastResult.points_awarded > 0
                        ? ` — +${lastResult.points_awarded} points!`
                        : ''
                    }`
              ) : (
                `Error: ${lastResult.error}`
              )}
            </div>
          )}

          {/* QR Scanner */}
          <div style={{ width: '100%', maxWidth: 560, marginBottom: '1.5rem' }}>
            <QRScanner onScan={handleQRScan} active={kioskMode} />
          </div>

          {/* Manual search */}
          <div style={{ width: '100%', maxWidth: 560, marginBottom: '2rem' }}>
            <ManualSearch eventId={eventId} onCheckIn={handleManualCheckIn} />
          </div>

          {/* Exit hint */}
          <div style={{ position: 'absolute', bottom: '1rem', right: '1.5rem', textAlign: 'right' }}>
            <p style={{ fontSize: '0.7rem', color: 'var(--pz-chrome-muted)' }}>
              {escCount > 0
                ? `Esc ×${escCount}/3 to exit kiosk`
                : 'Press Esc × 3 to exit kiosk mode'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

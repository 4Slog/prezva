'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { QRScanner } from '@/components/checkin/QRScanner'
import { ManualSearch } from '@/components/checkin/ManualSearch'
import { CheckInDashboard } from '@/components/checkin/CheckInDashboard'
import { checkInByQR, checkInBySearch, getCheckInStats } from '@/lib/checkin/actions'
import type { CheckInResult, CheckInStats } from '@/lib/checkin/actions'
import { queueCheckIn, getPendingCount, syncPending } from '@/lib/checkin/offline-db'

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
}

type Tab = 'qr' | 'search' | 'stats'

const DEVICE_ID_KEY = 'prezva-device-id'

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

export function CheckInClient({ eventId, eventName, initialStats, volunteerStatus }: CheckInClientProps) {
  const [tab, setTab] = useState<Tab>('qr')
  const [stats, setStats] = useState<CheckInStats>(initialStats)
  const [lastResult, setLastResult] = useState<CheckInResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [isOnline, setIsOnline] = useState(() => typeof window !== 'undefined' ? navigator.onLine : true)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [kioskMode, setKioskMode] = useState(false)
  const [escCount, setEscCount] = useState(0)
  const escTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshPending = useCallback(async () => {
    const count = await getPendingCount(eventId)
    setPendingCount(count)
  }, [eventId])

  const triggerSync = useCallback(async () => {
    const count = await getPendingCount(eventId)
    if (count === 0) return
    setSyncing(true)
    await syncPending(eventId)
    const remaining = await getPendingCount(eventId)
    setPendingCount(remaining)
    setSyncing(false)
    const fresh = await getCheckInStats(eventId)
    setStats(fresh)
  }, [eventId])

  const refreshStats = useCallback(async () => {
    const fresh = await getCheckInStats(eventId)
    setStats(fresh)
  }, [eventId])

  useEffect(() => {
    getPendingCount(eventId).then(count => setPendingCount(count))
  }, [eventId])

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true)
      triggerSync()
    }
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

    if (!navigator.onLine) {
      const deviceId = getDeviceId()
      await queueCheckIn(eventId, normalizedCode, deviceId)
      await refreshPending()
      setLastResult({ success: true, registration: { id: 'offline', attendee_name: 'Queued (offline)', attendee_email: '', ticket_name: '', already_checked_in: false } })
      scanTimeoutRef.current = setTimeout(() => { setLastResult(null); setScanning(false) }, 3000)
      return
    }

    const result = await checkInByQR(eventId, normalizedCode)
    setLastResult(result)
    if (result.success) await refreshStats()
    scanTimeoutRef.current = setTimeout(() => { setLastResult(null); setScanning(false) }, 3000)
  }, [eventId, scanning, refreshStats, refreshPending])

  const handleManualCheckIn = useCallback(async (registrationId: string) => {
    const result = await checkInBySearch(eventId, registrationId)
    setLastResult(result)
    if (result.success) await refreshStats()
    setTimeout(() => setLastResult(null), 3000)
  }, [eventId, refreshStats])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'qr', label: 'QR Scanner' },
    { id: 'search', label: 'Name Search' },
    { id: 'stats', label: 'Dashboard' },
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
        <div className="flex-shrink-0 text-right">
          <div className="flex items-center gap-2 justify-end">
            <span className={`inline-block w-2 h-2 rounded-full ${isOnline ? 'bg-[var(--pz-success-fill)]' : 'bg-[var(--pz-error)]'}`} />
            <span className="text-xs text-[var(--pz-muted)]">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
          {pendingCount > 0 && (
            <div className="mt-1">
              <span className="text-xs text-yellow-600 font-medium">{pendingCount} pending</span>
              {isOnline && (
                <button
                  onClick={triggerSync}
                  disabled={syncing}
                  className="ml-2 text-xs underline disabled:opacity-50"
                  style={{ color: 'var(--pz-teal-ink)' }}
                >
                  {syncing ? 'Syncing…' : 'Sync now'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Offline banner */}
      {!isOnline && (
        <div className="p-3 rounded-lg text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 font-medium">
          Offline — scans will be queued and synced when reconnected
        </div>
      )}

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
        <button
          type="button"
          onClick={() => setKioskMode(true)}
          className="flex-shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
          style={{ borderColor: 'var(--pz-teal)', color: 'var(--pz-teal-ink)', background: 'none' }}
          title="Enter fullscreen kiosk mode"
        >
          Kiosk mode
        </button>
      </div>

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
              <span>⚠️ {lastResult.registration.attendee_name} already checked in</span>
            ) : (
              <span>✓ {lastResult.registration.attendee_name} checked in — {lastResult.registration.ticket_name}</span>
            )
          ) : (
            <span>✗ {lastResult.error}</span>
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
            <QRScanner onScan={handleQRScan} active={tab === 'qr'} />
          </div>
        )}
        {tab === 'search' && (
          <ManualSearch eventId={eventId} onCheckIn={handleManualCheckIn} />
        )}
        {tab === 'stats' && (
          <CheckInDashboard stats={stats} onRefresh={refreshStats} volunteerStatus={volunteerStatus} />
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
                  : `Checked in: ${lastResult.registration.attendee_name} — ${lastResult.registration.ticket_name}`
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

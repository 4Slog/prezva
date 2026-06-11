'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import { QRScanner } from '@/components/checkin/QRScanner'
import { ManualSearch } from '@/components/checkin/ManualSearch'
import { CheckInDashboard } from '@/components/checkin/CheckInDashboard'
import {
  checkInByQR,
  checkInBySearch,
  getCheckInStats,
  searchAttendeesForCheckIn,
} from '@/lib/embedded/checkin-actions'
import type { CheckInResult, CheckInStats } from '@/lib/checkin/actions'
import { queueCheckIn, getPendingCount, syncPendingEmbed } from '@/lib/checkin/offline-db'

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

interface EmbedCheckInClientProps {
  eventId: string
  eventName: string
  initialStats: CheckInStats
}

export function EmbedCheckInClient({ eventId, eventName, initialStats }: EmbedCheckInClientProps) {
  const [tab, setTab] = useState<Tab>('qr')
  const [stats, setStats] = useState<CheckInStats>(initialStats)
  const [lastResult, setLastResult] = useState<CheckInResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [isOnline, setIsOnline] = useState(() => typeof window !== 'undefined' ? navigator.onLine : true)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshPending = useCallback(async () => {
    const count = await getPendingCount(eventId)
    setPendingCount(count)
  }, [eventId])

  const triggerSync = useCallback(async () => {
    const count = await getPendingCount(eventId)
    if (count === 0) return
    setSyncing(true)
    try {
      await syncPendingEmbed(eventId)
    } catch {
      // ignore — offline-db logs internally
    }
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
    const onOnline = () => { setIsOnline(true); triggerSync() }
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

      {!isOnline && (
        <div className="p-3 rounded-lg text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 font-medium">
          Offline — scans will be queued and synced when reconnected
        </div>
      )}

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
                : 'text-[var(--pz-muted)] hover:text-[var(--pz-muted)]')
            }
          >
            {t.label}
          </button>
        ))}
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
              <span className="flex items-center gap-1"><AlertTriangle size={14} /> {lastResult.registration.attendee_name} already checked in</span>
            ) : (
              <span className="flex items-center gap-1"><Check size={14} /> {lastResult.registration.attendee_name} checked in — {lastResult.registration.ticket_name}</span>
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
            <QRScanner onScan={handleQRScan} active={tab === 'qr'} />
          </div>
        )}
        {tab === 'search' && (
          <ManualSearch
            eventId={eventId}
            onCheckIn={handleManualCheckIn}
            onSearch={searchAttendeesForCheckIn}
          />
        )}
        {tab === 'stats' && (
          <CheckInDashboard stats={stats} onRefresh={refreshStats} volunteerStatus={null} />
        )}
      </div>
    </div>
  )
}

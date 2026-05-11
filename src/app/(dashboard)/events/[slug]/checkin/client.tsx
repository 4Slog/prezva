'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { QRScanner } from '@/components/checkin/QRScanner'
import { ManualSearch } from '@/components/checkin/ManualSearch'
import { CheckInDashboard } from '@/components/checkin/CheckInDashboard'
import { checkInByQR, checkInBySearch, getCheckInStats } from '@/lib/checkin/actions'
import { createWalkIn, getWaiverStatusAtCheckIn } from '@/lib/checkin/sprint7-actions'
import type { CheckInResult, CheckInStats } from '@/lib/checkin/actions'
import { queueCheckIn, getPendingCount, syncPending } from '@/lib/checkin/offline-db'

interface TicketType { id: string; name: string }

interface CheckInClientProps {
  eventId: string
  eventName: string
  initialStats: CheckInStats
  ticketTypes?: TicketType[]
}

type Tab = 'qr' | 'search' | 'walkin' | 'stats'

const DEVICE_ID_KEY = 'prezva-device-id'
function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_ID_KEY, id) }
  return id
}

export function CheckInClient({ eventId, eventName, initialStats, ticketTypes = [] }: CheckInClientProps) {
  const [tab, setTab] = useState<Tab>('qr')
  const [stats, setStats] = useState<CheckInStats>(initialStats)
  const [lastResult, setLastResult] = useState<CheckInResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [isOnline, setIsOnline] = useState(() => typeof window !== 'undefined' ? navigator.onLine : true)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [ticketFilter, setTicketFilter] = useState<string | null>(null)
  const [waiverWarning, setWaiverWarning] = useState<string[] | null>(null)
  const [walkInName, setWalkInName] = useState('')
  const [walkInEmail, setWalkInEmail] = useState('')
  const [walkInTicket, setWalkInTicket] = useState(ticketTypes[0]?.id ?? '')
  const [walkInSubmitting, setWalkInSubmitting] = useState(false)
  const [walkInResult, setWalkInResult] = useState<{ name: string; qr_code: string } | null>(null)
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshPending = useCallback(async () => {
    const count = await getPendingCount(eventId)
    setPendingCount(count)
  }, [eventId])

  const refreshStats = useCallback(async () => {
    const fresh = await getCheckInStats(eventId)
    setStats(fresh)
  }, [eventId])

  const triggerSync = useCallback(async () => {
    const count = await getPendingCount(eventId)
    if (count === 0) return
    setSyncing(true)
    await syncPending(eventId)
    const remaining = await getPendingCount(eventId)
    setPendingCount(remaining)
    setSyncing(false)
    await refreshStats()
  }, [eventId, refreshStats])

  useEffect(() => { getPendingCount(eventId).then(count => setPendingCount(count)) }, [eventId])

  useEffect(() => {
    const onOnline = () => { setIsOnline(true); triggerSync() }
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showResult = useCallback((result: CheckInResult) => {
    setLastResult(result)
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current)
    scanTimeoutRef.current = setTimeout(() => { setLastResult(null); setScanning(false) }, 3000)
  }, [])

  const handleQRScan = useCallback(async (code: string) => {
    if (scanning) return
    setScanning(true)
    setWaiverWarning(null)

    if (!navigator.onLine) {
      const deviceId = getDeviceId()
      await queueCheckIn(eventId, code, deviceId)
      await refreshPending()
      showResult({ success: true, registration: { id: 'offline', attendee_name: 'Queued (offline)', attendee_email: '', ticket_name: '', already_checked_in: false } })
      return
    }

    const result = await checkInByQR(eventId, code)
    if (result.success && result.registration && !result.registration.already_checked_in) {
      const waiverStatus = await getWaiverStatusAtCheckIn(eventId, result.registration.id)
      if (waiverStatus.blocked) setWaiverWarning(waiverStatus.unsigned.map((w: { id: string; title: string }) => w.title))
      await refreshStats()
    }
    showResult(result)
  }, [eventId, scanning, refreshStats, refreshPending, showResult])

  const handleManualCheckIn = useCallback(async (registrationId: string) => {
    setWaiverWarning(null)
    const result = await checkInBySearch(eventId, registrationId)
    if (result.success && !result.registration?.already_checked_in) {
      const waiverStatus = await getWaiverStatusAtCheckIn(eventId, registrationId)
      if (waiverStatus.blocked) setWaiverWarning(waiverStatus.unsigned.map((w: { id: string; title: string }) => w.title))
      await refreshStats()
    }
    showResult(result)
    setTimeout(() => setLastResult(null), 3000)
  }, [eventId, refreshStats, showResult])

  const handleWalkIn = useCallback(async () => {
    if (!walkInName.trim() || !walkInEmail.trim() || !walkInTicket) return
    setWalkInSubmitting(true)
    const result = await createWalkIn(eventId, {
      attendee_name: walkInName.trim(),
      attendee_email: walkInEmail.trim(),
      ticket_type_id: walkInTicket,
    })
    setWalkInSubmitting(false)
    if (result.error) {
      alert(result.error)
    } else if (result.data) {
      setWalkInResult(result.data)
      setWalkInName('')
      setWalkInEmail('')
      await refreshStats()
      setTimeout(() => setWalkInResult(null), 5000)
    }
  }, [eventId, walkInName, walkInEmail, walkInTicket, refreshStats])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'qr', label: 'QR Scanner' },
    { id: 'search', label: 'Name Search' },
    { id: 'walkin', label: 'Walk-in' },
    { id: 'stats', label: 'Dashboard' },
  ]

  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--pz-text)]">{eventName}</h1>
          <p className="text-sm text-[var(--pz-muted)] mt-1">
            Check-In — {stats.total_checked_in}/{stats.total_registered} attendees checked in
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="flex items-center gap-2 justify-end">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: isOnline ? 'var(--pz-success)' : 'var(--pz-error)' }} />
            <span className="text-xs text-[var(--pz-muted)]">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
          {pendingCount > 0 && (
            <div className="mt-1">
              <span className="text-xs font-medium" style={{ color: 'var(--pz-warning)' }}>{pendingCount} pending</span>
              {isOnline && (
                <button onClick={triggerSync} disabled={syncing} className="ml-2 text-xs underline disabled:opacity-50" style={{ color: 'var(--pz-teal)' }}>
                  {syncing ? 'Syncing…' : 'Sync now'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {!isOnline && (
        <div className="rounded-lg p-3 text-sm font-medium" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--pz-warning)' }}>
          Offline — scans will be queued and synced when reconnected
        </div>
      )}

      {/* T-082: Waiver warning */}
      {waiverWarning && waiverWarning.length > 0 && (
        <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--pz-error)' }}>
          <p className="font-semibold mb-1">Required waiver(s) not signed:</p>
          <ul className="list-disc list-inside text-xs space-y-0.5">
            {waiverWarning.map(w => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--pz-surface-2)' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 rounded-md py-2 text-xs font-medium transition-colors"
            style={{
              background: tab === t.id ? 'var(--pz-surface)' : 'transparent',
              color: tab === t.id ? 'var(--pz-text)' : 'var(--pz-muted)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {lastResult && (
        <div
          className="rounded-xl p-4 text-sm font-medium"
          style={
            lastResult.success
              ? lastResult.registration?.already_checked_in
                ? { background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--pz-warning)' }
                : { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: 'var(--pz-success)' }
              : { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--pz-error)' }
          }
        >
          {lastResult.success && lastResult.registration ? (
            lastResult.registration.already_checked_in ? (
              <span>⚠ {lastResult.registration.attendee_name} already checked in</span>
            ) : (
              <span>✓ {lastResult.registration.attendee_name} checked in — {lastResult.registration.ticket_name}</span>
            )
          ) : (
            <span>✗ {lastResult.error}</span>
          )}
        </div>
      )}

      <div>
        {tab === 'qr' && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--pz-muted)]">Point the camera at an attendee&apos;s QR code to check them in.</p>
            <QRScanner onScan={handleQRScan} active={tab === 'qr'} />
          </div>
        )}
        {tab === 'search' && (
          <ManualSearch eventId={eventId} onCheckIn={handleManualCheckIn} />
        )}
        {tab === 'walkin' && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--pz-muted)]">Register and check in an attendee on the spot.</p>
            {walkInResult && (
              <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: 'var(--pz-success)' }}>
                ✓ {walkInResult.name} registered and checked in (QR: {walkInResult.qr_code})
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Name</label>
                <input
                  value={walkInName}
                  onChange={e => setWalkInName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Email</label>
                <input
                  value={walkInEmail}
                  onChange={e => setWalkInEmail(e.target.value)}
                  type="email"
                  placeholder="email@example.com"
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={inputStyle}
                />
              </div>
              {ticketTypes.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Ticket type</label>
                  <select
                    value={walkInTicket}
                    onChange={e => setWalkInTicket(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={inputStyle}
                  >
                    {ticketTypes.map(tt => (
                      <option key={tt.id} value={tt.id}>{tt.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button
                onClick={handleWalkIn}
                disabled={walkInSubmitting || !walkInName.trim() || !walkInEmail.trim()}
                className="w-full rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
              >
                {walkInSubmitting ? 'Registering…' : 'Register & Check In'}
              </button>
            </div>
          </div>
        )}
        {tab === 'stats' && (
          <CheckInDashboard
            stats={stats}
            eventId={eventId}
            ticketTypes={ticketTypes}
            ticketFilter={ticketFilter}
            onFilterChange={setTicketFilter}
            onRefresh={refreshStats}
            onRealtimeUpdate={refreshStats}
          />
        )}
      </div>
    </div>
  )
}

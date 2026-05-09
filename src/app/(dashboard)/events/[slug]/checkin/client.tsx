'use client'

import { useState, useCallback } from 'react'
import { QRScanner } from '@/components/checkin/QRScanner'
import { ManualSearch } from '@/components/checkin/ManualSearch'
import { CheckInDashboard } from '@/components/checkin/CheckInDashboard'
import { checkInByQR, checkInBySearch, getCheckInStats } from '@/lib/checkin/actions'
import type { CheckInResult, CheckInStats } from '@/lib/checkin/actions'

interface CheckInClientProps {
  eventId: string
  eventName: string
  initialStats: CheckInStats
}

type Tab = 'qr' | 'search' | 'stats'

export function CheckInClient({ eventId, eventName, initialStats }: CheckInClientProps) {
  const [tab, setTab] = useState<Tab>('qr')
  const [stats, setStats] = useState<CheckInStats>(initialStats)
  const [lastResult, setLastResult] = useState<CheckInResult | null>(null)
  const [scanning, setScanning] = useState(false)

  const refreshStats = useCallback(async () => {
    const fresh = await getCheckInStats(eventId)
    setStats(fresh)
  }, [eventId])

  const handleQRScan = useCallback(async (code: string) => {
    if (scanning) return
    setScanning(true)
    const result = await checkInByQR(eventId, code)
    setLastResult(result)
    if (result.success) await refreshStats()
    setTimeout(() => { setLastResult(null); setScanning(false) }, 3000)
  }, [eventId, scanning, refreshStats])

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
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{eventName}</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Check-In — {stats.total_checked_in}/{stats.total_registered} attendees checked in
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-[var(--bg-subtle)] p-1 rounded-lg">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              'flex-1 py-2 text-sm font-medium rounded-md transition-colors ' +
              (tab === t.id
                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]')
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
            <p className="text-sm text-[var(--text-muted)]">
              Point the camera at an attendee&apos;s QR code to check them in.
            </p>
            <QRScanner onScan={handleQRScan} active={tab === 'qr'} />
          </div>
        )}
        {tab === 'search' && (
          <ManualSearch eventId={eventId} onCheckIn={handleManualCheckIn} />
        )}
        {tab === 'stats' && (
          <CheckInDashboard stats={stats} onRefresh={refreshStats} />
        )}
      </div>
    </div>
  )
}

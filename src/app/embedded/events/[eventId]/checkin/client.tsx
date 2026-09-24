'use client'

import { DoorRefusalNotice } from '@/components/checkin/DoorRefusalNotice'
import { NextGuestButton } from '@/components/checkin/NextGuestButton'
import { useScanResult } from '@/components/checkin/useScanResult'
import { useState, useCallback, useRef, useEffect } from 'react'
import { AlertTriangle, Check, Clock, Copy, CheckCheck, X } from 'lucide-react'
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
import { syncPendingEmbed } from '@/lib/checkin/offline-db'
import { useDoorQueue } from '@/components/checkin/useDoorQueue'
import { OfflineQueueStatus, NeedsAttentionList, MANUAL_CHECKIN_FAILED } from '@/components/checkin/OfflineQueuePanel'
import QRDisplay from '@/app/e/[slug]/my-qr/qr-display'

type Tab = 'qr' | 'search' | 'stats' | 'arrival-qr'

interface EmbedCheckInClientProps {
  eventId: string
  eventName: string
  initialStats: CheckInStats
  arrivalUrl: string
}

export function EmbedCheckInClient({ eventId, eventName, initialStats, arrivalUrl }: EmbedCheckInClientProps) {
  const [tab, setTab] = useState<Tab>('qr')
  const [arrivalCopied, setArrivalCopied] = useState(false)
  const [stats, setStats] = useState<CheckInStats>(initialStats)
  // O135: refusals stay until "Next guest"; successes clear after 3 s.
  // R84: a queued scan is an info notice, never an accepted check-in.
  const scan = useScanResult<{ kind: 'result'; result: CheckInResult } | { kind: 'queued' }>()
  const lastResult = scan.shown?.value.kind === 'result' ? scan.shown.value.result : null
  const queued = scan.shown?.value.kind === 'queued'
  const refusalUp = scan.shown?.kind === 'refusal'
  const busyRef = useRef(false)

  const refreshStats = useCallback(async () => {
    try {
      setStats(await getCheckInStats(eventId))
    } catch {
      // Offline or a failed refresh: keep the last stats.
    }
  }, [eventId])

  const { isOnline, pendingCount, needsAttention, syncing, triggerSync, queueScan, dismiss } =
    useDoorQueue(eventId, syncPendingEmbed, refreshStats)

  const showScan = scan.show
  const showResult = useCallback((result: CheckInResult, code?: string) =>
    showScan({ kind: 'result', result }, result.success ? 'success' : 'refusal', code), [showScan])

  async function scanNow(code: string, source: 'camera' | 'typed') {
    if (busyRef.current) return
    // O135: while a refusal is up, and for 3 s after the same code succeeded,
    // camera frames are ignored. A typed code always goes through.
    if (source === 'camera' && !scan.cameraMayScan(code)) return
    busyRef.current = true

    const normalizedCode = code.toLowerCase()
    const queue = async () => {
      await queueScan(normalizedCode)
      scan.show({ kind: 'queued' }, 'info')
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
      showResult(result, normalizedCode)
      if (result.success) await refreshStats()
    } catch (e) {
      console.error('[embed-checkin] could not queue scan:', e)
      showResult({ success: false, error: 'Scan not saved — try again' })
    } finally {
      busyRef.current = false
    }
  }

  // Stable for QRScanner (its camera effect restarts when onScan changes); the
  // latest scanNow runs through the ref.
  const scanNowRef = useRef(scanNow)
  useEffect(() => { scanNowRef.current = scanNow })
  const handleQRScan = useCallback((code: string, source: 'camera' | 'typed') => { void scanNowRef.current(code, source) }, [])

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
    // A manual check-in replaces whatever is on screen, refusal included.
    showResult(result)
    if (result.success) {
      try { await refreshStats() } catch (e) { console.error('[checkin] stats refresh failed:', e) }
    }
  }, [eventId, refreshStats, showResult])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'qr', label: 'QR Scanner' },
    { id: 'search', label: 'Name Search' },
    { id: 'stats', label: 'Dashboard' },
    { id: 'arrival-qr', label: 'Arrival QR' },
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
        <OfflineQueueStatus
          isOnline={isOnline}
          pendingCount={pendingCount}
          needsAttentionCount={needsAttention.length}
          syncing={syncing}
          onSync={triggerSync}
        />
      </div>

      {!isOnline && (
        <div className="p-3 rounded-lg text-sm bg-yellow-50 border border-yellow-200 text-yellow-800 font-medium">
          Offline — scans will be queued and synced when reconnected
        </div>
      )}

      <NeedsAttentionList entries={needsAttention} onDismiss={dismiss} />

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

      {/* Queued scan: distinct from a check-in, no attendee shown */}
      {queued && (
        <div className="p-4 rounded-xl border text-sm font-medium bg-blue-50 border-blue-200 text-blue-800">
          <span className="flex items-center gap-1"><Clock size={14} /> Queued — will sync</span>
        </div>
      )}

      {/* Scan result toast — a refused ticket (R90) gets the red "Do not admit" */}
      {lastResult?.refusal && <DoorRefusalNotice refusal={lastResult.refusal} />}
      {refusalUp && <NextGuestButton onClick={scan.next} />}
      {lastResult && !lastResult.refusal && (
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
        {tab === 'arrival-qr' && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--pz-muted)]">
              Attendees can scan this QR code to self-check-in when they arrive.
            </p>
            <div className="flex justify-center">
              <QRDisplay qrCode={arrivalUrl} />
            </div>
            <div
              className="flex items-center gap-2 p-3 rounded-lg"
              style={{ background: 'var(--pz-bg)', border: '1px solid var(--pz-border)' }}
            >
              <p className="flex-1 text-xs font-mono truncate" style={{ color: 'var(--pz-muted)' }}>
                {arrivalUrl}
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(arrivalUrl).then(() => {
                    setArrivalCopied(true)
                    setTimeout(() => setArrivalCopied(false), 2000)
                  })
                }}
                className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', cursor: 'pointer' }}
              >
                {arrivalCopied ? <><CheckCheck size={12} /> Copied</> : <><Copy size={12} /> Copy URL</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

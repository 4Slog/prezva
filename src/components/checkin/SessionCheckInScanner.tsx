'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Check, AlertTriangle, X, Copy, CheckCheck, CloudOff, Clock } from 'lucide-react'
import { QRScanner } from '@/components/checkin/QRScanner'
import { OfflineQueueStatus, AttentionList, type AttentionItem } from '@/components/checkin/OfflineQueuePanel'
import { isNetworkFailure, thrownMessage } from '@/lib/checkin/network-error'
import { useSessionOffline, type OfflineOutcome } from '@/components/checkin/useSessionOffline'
import { truncateToken, type ScanSurface } from '@/lib/checkin/session-offline-db'
import type { OfflineSessionPack } from '@/lib/checkin/offline-pack'
import type { CheckInResult, SessionAttendeeRow } from '@/lib/checkin/actions'
import QRDisplay from '@/app/e/[slug]/my-qr/qr-display'

type Tab = 'scan' | 'attendees' | 'session-qr'

export interface SessionScannerActions {
  scan: (code: string) => Promise<CheckInResult>
  mark: (registrationId: string) => Promise<CheckInResult>
  override: (registrationId: string) => Promise<CheckInResult>
  fetchPack: () => Promise<OfflineSessionPack | { error: string }>
}

interface Props {
  surface: ScanSurface
  eventId: string
  sessionId: string
  sessionTitle: string
  sessionUrl: string
  initialAttendees: SessionAttendeeRow[]
  staffKey: string | null
  actions: SessionScannerActions
}

// An offline outcome on screen: styled apart from an online accept.
type OfflineToast =
  | { kind: 'accepted'; text: string }
  | { kind: 'already'; text: string }
  | { kind: 'no_match'; token: string }
  | { kind: 'recheck_queued' }
  | { kind: 'error'; text: string }

const SESSION_EXPIRED_TEXT: Record<ScanSurface, (n: number) => string> = {
  dashboard: n => `Signed out — sign in again to sync ${n} queued check-in${n === 1 ? '' : 's'}`,
  embed: n => `Session expired — reopen this page from GHL to sync ${n} queued check-in${n === 1 ? '' : 's'}`,
}

// The session scanner shared by the dashboard and the GHL embed. Online it
// behaves exactly as before; when the browser is offline, or an online call
// THROWS (no network), it checks people in against the device list and queues
// the check-in for sync (M3b).
export function SessionCheckInScanner({
  surface,
  eventId,
  sessionId,
  sessionTitle,
  sessionUrl,
  initialAttendees,
  staffKey,
  actions,
}: Props) {
  const [tab, setTab] = useState<Tab>('scan')
  const [attendees, setAttendees] = useState<SessionAttendeeRow[]>(initialAttendees)
  const [lastResult, setLastResult] = useState<CheckInResult | null>(null)
  const [offlineToast, setOfflineToast] = useState<OfflineToast | null>(null)
  const [scanning, setScanning] = useState(false)
  const [copied, setCopied] = useState(false)
  const [overrideMode, setOverrideMode] = useState(false)
  const [lastWasOverride, setLastWasOverride] = useState(false)
  const [search, setSearch] = useState('')
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)

  const offline = useSessionOffline({
    surface,
    eventId,
    sessionId,
    staffKey,
    fetchPack: actions.fetchPack,
  })

  // Offline, the device list (complete, and with this device's check-ins) is
  // what staff see and search; online, the server's list as before.
  const rows: SessionAttendeeRow[] = offline.offlineMode && offline.localList.length > 0
    ? offline.localList.map(r => ({
        registration_id: r.registrationId,
        attendee_name: r.name,
        attendee_email: r.email,
        ticket_name: r.ticketName,
        checked_in: !!r.checkedInAt,
        checked_in_at: r.checkedInAt ?? undefined,
      }))
    : attendees

  const checkedInCount = rows.filter(a => a.checked_in).length
  const query = search.trim().toLowerCase()
  const visibleAttendees = query
    ? rows.filter(a =>
        a.attendee_name.toLowerCase().includes(query) ||
        a.attendee_email.toLowerCase().includes(query))
    : rows

  function applyCheckIn(registrationId: string, checkedInAt: string) {
    setAttendees(prev =>
      prev.map(a =>
        a.registration_id === registrationId
          ? { ...a, checked_in: true, checked_in_at: checkedInAt }
          : a
      )
    )
  }

  function clearTimer() {
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
  }

  function showResult(result: CheckInResult, viaOverride = false) {
    clearTimer()
    setOfflineToast(null)
    setLastResult(result)
    setLastWasOverride(viaOverride)
    // A refused GHL ticket stays up until staff act on it or dismiss it (R81).
    if (!result.canOverride) {
      resultTimerRef.current = setTimeout(() => setLastResult(null), 3000)
    }
  }

  function showOffline(toast: OfflineToast) {
    clearTimer()
    setLastResult(null)
    setOfflineToast(toast)
    // "Not on this device's list" waits for staff to choose (R85).
    if (toast.kind !== 'no_match') {
      resultTimerRef.current = setTimeout(() => setOfflineToast(null), 4000)
    }
  }

  function showOfflineOutcome(outcome: OfflineOutcome, viaOverride = false) {
    if (outcome.kind === 'accepted') {
      const verb = viaOverride ? 'Override' : 'Accepted'
      showOffline({ kind: 'accepted', text: `${verb}: ${outcome.name} (offline — will sync)` })
    } else if (outcome.kind === 'already') {
      showOffline({ kind: 'already', text: 'Already checked in (this device)' })
    } else if (outcome.kind === 'no_match') {
      showOffline({ kind: 'no_match', token: outcome.token })
    } else if (outcome.kind === 'recheck_queued') {
      showOffline({ kind: 'recheck_queued' })
    } else {
      showOffline({ kind: 'error', text: outcome.message })
    }
  }

  function dismissResult() {
    clearTimer()
    setLastResult(null)
    setOfflineToast(null)
  }

  function startOverride() {
    dismissResult()
    setOverrideMode(true)
    setSearch('')
    setTab('attendees')
  }

  useEffect(() => {
    if (overrideMode && tab === 'attendees') searchRef.current?.focus()
  }, [overrideMode, tab])

  useEffect(() => () => { if (resultTimerRef.current) clearTimeout(resultTimerRef.current) }, [])

  const { offlineScan, queueRecheck, offlineMark, markNetworkFailed, markNetworkOk } = offline
  const scanAction = actions.scan

  async function scanNow(code: string) {
    if (scanning || busyRef.current) return
    busyRef.current = true
    setScanning(true)
    try {
      const scanOffline = async () => {
        const outcome = await offlineScan(code)
        showOfflineOutcome(outcome)
        if (outcome.kind === 'accepted') applyCheckIn(outcome.registrationId, new Date().toISOString())
      }
      if (!navigator.onLine) {
        await scanOffline()
        return
      }
      let result: CheckInResult
      try {
        // The server parses the token (Prezva QR or GHL ticket) — send it as decoded.
        result = await scanAction(code)
      } catch (e) {
        if (!isNetworkFailure(e)) {
          // The server answered with an error: a refusal, not a reason to go offline.
          showResult({ success: false, error: thrownMessage(e) })
          return
        }
        // No network (or connected without internet): the device list decides.
        markNetworkFailed()
        await scanOffline()
        return
      }
      markNetworkOk()
      showResult(result)
      if (result.success && result.registration && !result.registration.already_checked_in) {
        applyCheckIn(result.registration.id, new Date().toISOString())
      }
    } catch (e) {
      console.error('[session-checkin] scan failed:', e)
      showOffline({ kind: 'error', text: 'Could not check in — try again' })
    } finally {
      busyRef.current = false
      setScanning(false)
    }
  }

  // Stable for QRScanner (its camera effect restarts when onScan changes); the
  // latest scanNow runs through the ref.
  const scanNowRef = useRef(scanNow)
  useEffect(() => { scanNowRef.current = scanNow })
  const handleQRScan = useCallback((code: string) => { void scanNowRef.current(code) }, [])

  async function handleRecheck(token: string) {
    try {
      showOfflineOutcome(await queueRecheck(token))
    } catch (e) {
      console.error('[session-checkin] recheck queue failed:', e)
      showOffline({ kind: 'error', text: 'Could not queue the re-check — try again' })
    }
  }

  async function handleManualToggle(registrationId: string, currentlyCheckedIn: boolean) {
    if (currentlyCheckedIn || busyRef.current) return
    busyRef.current = true
    const viaOverride = overrideMode
    const name = rows.find(a => a.registration_id === registrationId)?.attendee_name ?? ''
    const queueOffline = async () => {
      const outcome = await offlineMark(registrationId, viaOverride ? 'override' : 'manual', name)
      showOfflineOutcome(outcome, viaOverride)
      if (outcome.kind === 'accepted' || outcome.kind === 'already') {
        applyCheckIn(registrationId, new Date().toISOString())
        if (viaOverride) setOverrideMode(false)
      }
    }
    try {
      if (!navigator.onLine) {
        await queueOffline()
        return
      }
      let result: CheckInResult
      try {
        result = viaOverride ? await actions.override(registrationId) : await actions.mark(registrationId)
      } catch (e) {
        if (!isNetworkFailure(e)) {
          showResult({ success: false, error: thrownMessage(e) }, viaOverride)
          return
        }
        markNetworkFailed()
        await queueOffline()
        return
      }
      markNetworkOk()
      showResult(result, viaOverride)
      if (result.success && result.registration) {
        applyCheckIn(registrationId, new Date().toISOString())
        if (viaOverride) setOverrideMode(false)
      }
    } catch (e) {
      console.error('[session-checkin] mark failed:', e)
      showOffline({ kind: 'error', text: 'Could not check in — try again' })
    } finally {
      busyRef.current = false
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
    { id: 'attendees', label: `Attendees (${checkedInCount}/${rows.length})` },
    { id: 'session-qr', label: 'Session QR' },
  ]

  const attentionItems: AttentionItem[] = offline.summary.needsAttention.map(e => ({
    key: e.entryId,
    label: e.attendeeName ?? (e.token ? truncateToken(e.token) : 'Unknown ticket'),
    mono: !e.attendeeName,
    scannedAt: e.scannedAt,
    reason: e.reason,
  }))

  const showPackNote = offline.packStatus === 'expired' || (offline.offlineMode && offline.packMessage)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--pz-text)' }}>{sessionTitle}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--pz-muted)' }}>
            Session check-in — {checkedInCount}/{rows.length} checked in
          </p>
        </div>
        <OfflineQueueStatus
          isOnline={!offline.offlineMode}
          pendingCount={offline.summary.pending}
          pendingVerificationCount={offline.summary.pendingVerification}
          needsAttentionCount={offline.summary.needsAttention.length}
          syncing={offline.syncing}
          onSync={offline.triggerSync}
        />
      </div>

      {offline.sessionExpired && offline.summary.pending > 0 && (
        <div role="alert" className="p-3 rounded-lg text-sm font-medium bg-red-50 border border-red-200 text-red-800">
          {SESSION_EXPIRED_TEXT[surface](offline.summary.pending)}
        </div>
      )}

      {showPackNote && (
        <p className="text-xs p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
          {offline.packMessage}
        </p>
      )}

      {surface === 'embed' && offline.offlineMode && (
        <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>
          Offline check-ins are kept only while this page stays open
        </p>
      )}

      <AttentionList items={attentionItems} onDismiss={key => void offline.dismiss(key)} noun="check-in" />

      {/* Tab switcher */}
      <div className="flex gap-1 bg-[var(--pz-bg)] p-1 rounded-lg">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); if (t.id !== 'attendees') setOverrideMode(false) }}
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
                <Check size={14} /> {lastResult.registration.attendee_name} checked in{lastWasOverride ? ' (override)' : ''}
              </span>
            )
          ) : (
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1"><X size={14} /> {lastResult.error}</span>
              {lastResult.canOverride && (
                <span className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={startOverride}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-600 text-white"
                  >
                    Override…
                  </button>
                  <button onClick={dismissResult} aria-label="Dismiss" className="p-1">
                    <X size={14} />
                  </button>
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {/* Offline outcome toast — dashed border, cloud icon: not an online accept */}
      {offlineToast && (
        <div
          data-testid="offline-toast"
          className={
            'p-4 rounded-xl border-2 border-dashed text-sm font-medium ' +
            (offlineToast.kind === 'accepted' || offlineToast.kind === 'recheck_queued'
              ? 'bg-sky-50 border-sky-300 text-sky-900'
              : offlineToast.kind === 'already'
                ? 'bg-yellow-50 border-yellow-300 text-yellow-800'
                : 'bg-red-50 border-red-300 text-red-800')
          }
        >
          {offlineToast.kind === 'no_match' ? (
            <span className="flex items-center justify-between gap-2 flex-wrap">
              <span className="flex items-center gap-1"><CloudOff size={14} /> Not on this device&apos;s list</span>
              <span className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => void handleRecheck(offlineToast.token)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-sky-700 text-white"
                >
                  Queue for re-check
                </button>
                <button
                  onClick={startOverride}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-600 text-white"
                >
                  Override…
                </button>
                <button onClick={dismissResult} aria-label="Dismiss" className="p-1">
                  <X size={14} />
                </button>
              </span>
            </span>
          ) : offlineToast.kind === 'recheck_queued' ? (
            <span className="flex items-center gap-1"><Clock size={14} /> Pending verification — will be checked when this device syncs</span>
          ) : (
            <span className="flex items-center gap-1"><CloudOff size={14} /> {offlineToast.text}</span>
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
          {overrideMode && (
            <div className="flex items-center justify-between gap-2 p-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-800">
              <span>Override: tap the attendee to check them in.</span>
              <button onClick={() => setOverrideMode(false)} className="text-xs underline flex-shrink-0">
                Cancel
              </button>
            </div>
          )}
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or email"
            aria-label="Search attendees by name or email"
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
          />
          {rows.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: 'var(--pz-muted)' }}>
              No confirmed registrations yet.
            </p>
          )}
          {rows.length > 0 && visibleAttendees.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: 'var(--pz-muted)' }}>
              No attendees match.
            </p>
          )}
          {visibleAttendees.map(a => (
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
                {a.checked_in ? <><CheckCheck size={12} /> Checked in</> : overrideMode ? 'Override' : 'Mark in'}
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

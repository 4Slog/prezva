'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { OfflineSessionPack } from '@/lib/checkin/offline-pack'
import { getDeviceId } from '@/lib/checkin/device-id'
import {
  scanDbName,
  openScanDb,
  savePack,
  getPackState,
  clearFinishedEvents,
  findByScan,
  findByRegistration,
  isCheckedInLocally,
  listLocal,
  enqueue,
  queueSummary,
  dismissQueueEntry,
  syncSessionQueue,
  PACK_TOO_OLD_MESSAGE,
  OFFLINE_UNAVAILABLE_MESSAGE,
  NO_PACK_MESSAGE,
  type ScanSurface,
  type SessionScanDB,
  type ListRow,
  type QueueSummary,
  type PackState,
} from '@/lib/checkin/session-offline-db'

export const PACK_REFRESH_MS = 5 * 60 * 1000
export const SESSION_SYNC_INTERVAL_MS = 30_000

export type OfflineOutcome =
  | { kind: 'accepted'; name: string; registrationId: string }
  | { kind: 'already'; name: string }
  | { kind: 'no_match'; token: string }
  | { kind: 'recheck_queued' }
  | { kind: 'unavailable'; message: string }

type PackStatus = PackState['state'] | 'loading'

function unavailableMessage(state: PackStatus): string {
  if (state === 'stale') return PACK_TOO_OLD_MESSAGE
  if (state === 'expired') return OFFLINE_UNAVAILABLE_MESSAGE
  return NO_PACK_MESSAGE
}

export function sessionSyncUrl(surface: ScanSurface, eventId: string, sessionId: string): string {
  const base = surface === 'embed' ? '/api/embedded/events' : '/api/events'
  return `${base}/${eventId}/sessions/${sessionId}/checkin/sync`
}

interface Options {
  surface: ScanSurface
  eventId: string
  sessionId: string
  // Dashboard: the user id. Embedded: the staff email (or null).
  staffKey: string | null
  fetchPack: () => Promise<OfflineSessionPack | { error: string }>
  // Called after a sync wrote at least one entry.
  onSynced?: () => void
}

// M3b-B: the offline half of a session scanner — the device list (pack), the
// queue, and its sync. Online scanning is the client's job; this is consulted
// only when the device is offline or an online call threw.
export function useSessionOffline({ surface, eventId, sessionId, staffKey, fetchPack, onSynced }: Options) {
  const [db, setDb] = useState<SessionScanDB | null>(null)
  const [isOnline, setIsOnline] = useState(() => typeof window !== 'undefined' ? navigator.onLine : true)
  const [networkFailed, setNetworkFailed] = useState(false)
  const [packStatus, setPackStatus] = useState<PackStatus>('loading')
  const [summary, setSummary] = useState<QueueSummary>({ pending: 0, pendingVerification: 0, needsAttention: [] })
  const [localList, setLocalList] = useState<ListRow[]>([])
  const [syncing, setSyncing] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const syncingRef = useRef(false)
  const pendingRef = useRef(0)
  const fetchPackRef = useRef(fetchPack)
  const onSyncedRef = useRef(onSynced)
  useEffect(() => {
    fetchPackRef.current = fetchPack
    onSyncedRef.current = onSynced
  })

  useEffect(() => {
    let cancelled = false
    void scanDbName(surface, staffKey, eventId)
      .then(name => { if (!cancelled) setDb(openScanDb(name)) })
      .catch(e => console.error('[session-offline] device store unavailable:', e))
    return () => { cancelled = true }
  }, [surface, staffKey, eventId])

  const refreshLocal = useCallback(async () => {
    if (!db) return
    try {
      await clearFinishedEvents(db)
      const [state, s, list] = await Promise.all([
        getPackState(db, sessionId),
        queueSummary(db, sessionId),
        listLocal(db, sessionId),
      ])
      pendingRef.current = s.pending
      setPackStatus(state.state)
      setSummary(s)
      setLocalList(list)
    } catch (e) {
      console.error('[session-offline] device store unavailable:', e)
    }
  }, [db, sessionId])

  const refreshPack = useCallback(async () => {
    if (!db || !navigator.onLine) return
    try {
      const pack = await fetchPackRef.current()
      if (!('error' in pack)) await savePack(db, sessionId, pack)
    } catch {
      // Keep the stored pack; getPackState judges its age.
    }
    await refreshLocal()
  }, [db, sessionId, refreshLocal])

  const triggerSync = useCallback(async () => {
    if (!db || syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      if ((await queueSummary(db, sessionId)).pending === 0) return
      await refreshPack()
      const outcome = await syncSessionQueue(db, {
        url: sessionSyncUrl(surface, eventId, sessionId),
        sessionId,
        deviceId: getDeviceId(),
      })
      if (outcome.sessionExpired) setSessionExpired(true)
      else if (outcome.ok) setSessionExpired(false)
      if (outcome.ok && outcome.synced > 0) {
        await refreshPack()
        onSyncedRef.current?.()
      }
    } catch (e) {
      console.error('[session-offline] sync failed:', e)
    } finally {
      syncingRef.current = false
      setSyncing(false)
      await refreshLocal()
    }
  }, [db, surface, eventId, sessionId, refreshPack, refreshLocal])

  // Open: read the device, fetch the pack, and sync anything left from before.
  useEffect(() => {
    if (!db) return
    let cancelled = false
    void (async () => {
      await refreshLocal()
      if (cancelled || !navigator.onLine) return
      await refreshPack()
      if (!cancelled && pendingRef.current > 0) void triggerSync()
    })()
    return () => { cancelled = true }
  }, [db, refreshLocal, refreshPack, triggerSync])

  useEffect(() => {
    const onOnline = () => { setIsOnline(true); setNetworkFailed(false); void triggerSync() }
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const syncTimer = setInterval(() => {
      if (navigator.onLine && pendingRef.current > 0) void triggerSync()
    }, SESSION_SYNC_INTERVAL_MS)
    const packTimer = setInterval(() => {
      if (navigator.onLine) void refreshPack()
    }, PACK_REFRESH_MS)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(syncTimer)
      clearInterval(packTimer)
    }
  }, [triggerSync, refreshPack])

  // Leaving with unsynced check-ins asks first.
  useEffect(() => {
    if (summary.pending === 0) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [summary.pending])

  // A ready pack, or why offline check-in cannot run.
  const readyGrant = useCallback(async (): Promise<{ grant: string } | { message: string }> => {
    if (!db) return { message: NO_PACK_MESSAGE }
    const state = await getPackState(db, sessionId)
    if (state.state !== 'ready') return { message: unavailableMessage(state.state) }
    return { grant: state.meta.grant }
  }, [db, sessionId])

  const offlineScan = useCallback(async (raw: string): Promise<OfflineOutcome> => {
    const ready = await readyGrant()
    if ('message' in ready || !db) return { kind: 'unavailable', message: 'message' in ready ? ready.message : NO_PACK_MESSAGE }
    const row = await findByScan(db, sessionId, raw)
    if (!row) return { kind: 'no_match', token: raw }
    if (await isCheckedInLocally(db, sessionId, row.registrationId)) return { kind: 'already', name: row.name }
    await enqueue(db, {
      sessionId, kind: 'scan', token: raw, registrationId: row.registrationId, attendeeName: row.name, grant: ready.grant,
    })
    await refreshLocal()
    return { kind: 'accepted', name: row.name, registrationId: row.registrationId }
  }, [db, sessionId, readyGrant, refreshLocal])

  // R85: only when staff press "Queue for re-check".
  const queueRecheck = useCallback(async (raw: string): Promise<OfflineOutcome> => {
    const ready = await readyGrant()
    if ('message' in ready || !db) return { kind: 'unavailable', message: 'message' in ready ? ready.message : NO_PACK_MESSAGE }
    await enqueue(db, { sessionId, kind: 'recheck', token: raw, grant: ready.grant })
    await refreshLocal()
    return { kind: 'recheck_queued' }
  }, [db, sessionId, readyGrant, refreshLocal])

  const offlineMark = useCallback(async (
    registrationId: string,
    kind: 'manual' | 'override',
    fallbackName: string,
  ): Promise<OfflineOutcome> => {
    const ready = await readyGrant()
    if ('message' in ready || !db) return { kind: 'unavailable', message: 'message' in ready ? ready.message : NO_PACK_MESSAGE }
    const row = await findByRegistration(db, sessionId, registrationId)
    const name = row?.name ?? fallbackName
    if (await isCheckedInLocally(db, sessionId, registrationId)) return { kind: 'already', name }
    await enqueue(db, { sessionId, kind, registrationId, attendeeName: name, grant: ready.grant })
    await refreshLocal()
    return { kind: 'accepted', name, registrationId }
  }, [db, sessionId, readyGrant, refreshLocal])

  const dismiss = useCallback(async (entryId: string) => {
    if (!db) return
    try {
      await dismissQueueEntry(db, entryId)
    } finally {
      await refreshLocal()
    }
  }, [db, refreshLocal])

  return {
    isOnline,
    // Offline mode: the browser says offline, or the last online call threw.
    offlineMode: !isOnline || networkFailed,
    markNetworkFailed: useCallback(() => setNetworkFailed(true), []),
    markNetworkOk: useCallback(() => setNetworkFailed(false), []),
    packStatus,
    packMessage: packStatus === 'ready' || packStatus === 'loading' ? null : unavailableMessage(packStatus),
    localList,
    summary,
    syncing,
    sessionExpired,
    triggerSync,
    offlineScan,
    queueRecheck,
    offlineMark,
    dismiss,
  }
}

'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  queueCheckIn,
  getQueueCounts,
  listNeedsAttention,
  dismissEntry,
  type PendingCheckIn,
  type SyncOutcome,
} from '@/lib/checkin/offline-db'

const DEVICE_ID_KEY = 'prezva-device-id'
export const SYNC_INTERVAL_MS = 30_000

let memoryDeviceId: string | null = null

// localStorage can be unavailable or throw (partitioned storage in the GHL
// iframe, private mode); a missing device id must never stop a scan queueing.
function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch {
    memoryDeviceId ??= crypto.randomUUID()
    return memoryDeviceId
  }
}

// R84: the event-door offline queue, shared by the dashboard and embedded door
// clients. Syncs on the online event, on demand, and every SYNC_INTERVAL_MS while
// online with entries pending; never two syncs at once.
export function useDoorQueue(
  eventId: string,
  sync: (eventId: string) => Promise<SyncOutcome>,
  onSynced: () => void,
) {
  const [isOnline, setIsOnline] = useState(() => typeof window !== 'undefined' ? navigator.onLine : true)
  const [pendingCount, setPendingCount] = useState(0)
  const [needsAttention, setNeedsAttention] = useState<PendingCheckIn[]>([])
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)
  const pendingRef = useRef(0)
  const syncRef = useRef(sync)
  const onSyncedRef = useRef(onSynced)
  useEffect(() => {
    syncRef.current = sync
    onSyncedRef.current = onSynced
  })

  const refresh = useCallback(async () => {
    try {
      const [counts, attention] = await Promise.all([getQueueCounts(eventId), listNeedsAttention(eventId)])
      pendingRef.current = counts.pending
      setPendingCount(counts.pending)
      setNeedsAttention(attention)
    } catch (e) {
      console.error('[checkin] offline queue unavailable:', e)
    }
  }, [eventId])

  const triggerSync = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      const { pending } = await getQueueCounts(eventId)
      if (pending === 0) return
      const outcome = await syncRef.current(eventId)
      if (outcome.synced > 0) onSyncedRef.current()
    } catch (e) {
      console.error('[checkin] offline sync failed:', e)
    } finally {
      syncingRef.current = false
      setSyncing(false)
      await refresh()
    }
  }, [eventId, refresh])

  const queueScan = useCallback(async (qrCode: string) => {
    await queueCheckIn(eventId, qrCode, getDeviceId())
    await refresh()
  }, [eventId, refresh])

  const dismiss = useCallback(async (id: number) => {
    try {
      await dismissEntry(id)
    } finally {
      await refresh()
    }
  }, [refresh])

  useEffect(() => {
    // Initial read of the queue, then a first sync of anything left from before.
    let cancelled = false
    void (async () => {
      await refresh()
      if (!cancelled && navigator.onLine && pendingRef.current > 0) void triggerSync()
    })()
    return () => { cancelled = true }
  }, [triggerSync, refresh])

  useEffect(() => {
    const onOnline = () => { setIsOnline(true); void triggerSync() }
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const timer = setInterval(() => {
      if (navigator.onLine && pendingRef.current > 0) void triggerSync()
    }, SYNC_INTERVAL_MS)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(timer)
    }
  }, [triggerSync])

  return { isOnline, pendingCount, needsAttention, syncing, triggerSync, queueScan, dismiss }
}

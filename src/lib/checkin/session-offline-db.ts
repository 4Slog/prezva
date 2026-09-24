import Dexie, { type EntityTable, type Table } from 'dexie'
import { parseScanToken } from '@/lib/checkin/scan-token'
import {
  MAX_SYNC_ENTRIES,
  type OfflineEntryResult,
  type OfflineSyncResponse,
} from '@/lib/checkin/offline-sync'
import type { OfflineSessionPack, OfflinePackAttendee } from '@/lib/checkin/offline-pack'

// M3b-B: the device side of offline SESSION scanning. One IndexedDB database
// per surface, staff member and event:
//
//   prezva-scan:{surface}:{scope}:{eventId}
//
// scope = first 16 hex of SHA-256 of the user id (dashboard) or of the
// lowercased staff email (embedded), or 'anon' for an embed session with no
// email. Two staff on one browser never share a list or a queue.
//
// Statuses are STRINGS (the R84 lesson: a boolean is not a valid IndexedDB key,
// so an index on one matches nothing).

export type ScanSurface = 'dashboard' | 'embed'
export type SessionEntryKind = 'scan' | 'recheck' | 'manual' | 'override'
export type SessionQueueStatus = 'pending' | 'needs_attention' | 'synced' | 'dismissed'

export interface PackMetaRow {
  sessionId: string
  grant: string
  fetchedAt: string
  // serverNow - device clock when the pack arrived.
  serverOffsetMs: number
  eventEndsAt: string | null
}

export interface ListRow {
  sessionId: string
  registrationId: string
  name: string
  email: string
  ticketName: string
  ghlIdHash: string | null
  qrHash: string | null
  checkedInAt: string | null
}

export interface QueueRow {
  entryId: string
  sessionId: string
  kind: SessionEntryKind
  // The raw scanned text (scan / recheck). Deleted once the entry is synced or
  // dismissed: it is a check-in credential.
  token?: string
  // manual / override: the attendee. scan: the local match, used only to say
  // "already checked in (this device)" — the server re-resolves the token.
  registrationId?: string
  scannedAt: string
  status: SessionQueueStatus
  reason?: string
  attendeeName?: string
  // The staff grant in force when the entry was queued (R88): the entry syncs
  // under the identity that made it, even after the list is cleared.
  grant?: string
}

export const SCAN_DB_PREFIX = 'prezva-scan:'
const REGISTRY_KEY = 'prezva-scan-dbs'

export const PACK_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const LIST_KEEP_AFTER_EVENT_MS = 24 * 60 * 60 * 1000

export const PACK_TOO_OLD_MESSAGE =
  'Attendee list is too old to check people in offline. Reconnect to refresh.'
export const OFFLINE_UNAVAILABLE_MESSAGE = 'Offline check-in is not available for this event'
export const NO_PACK_MESSAGE = 'Offline check-in is not ready yet. Reconnect to load the attendee list.'

export class SessionScanDB extends Dexie {
  meta!: EntityTable<PackMetaRow, 'sessionId'>
  list!: Table<ListRow, [string, string]>
  queue!: EntityTable<QueueRow, 'entryId'>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      meta: 'sessionId',
      // Rows with a null hash are simply absent from that index.
      list: '[sessionId+registrationId], sessionId, [sessionId+qrHash], [sessionId+ghlIdHash]',
      queue: 'entryId, sessionId, [sessionId+status], [sessionId+registrationId], status, scannedAt',
    })
  }
}

// ── Hashing ──────────────────────────────────────────────────────────────────

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

// The M3b-A contract: SHA-256 hex of the lowercased value, where the value is
// what the online lookup compares — the GHL attendee id, the Prezva QR code, or
// (anything else) the raw text lowercased.
export async function hashScan(raw: string): Promise<{ field: 'ghlIdHash' | 'qrHash'; hash: string }> {
  const token = parseScanToken(raw)
  if (token.kind === 'ghl') return { field: 'ghlIdHash', hash: await sha256Hex(token.attendeeId.toLowerCase()) }
  const value = token.kind === 'prezva' ? token.qrCode : raw
  return { field: 'qrHash', hash: await sha256Hex(value.toLowerCase()) }
}

// ── Database naming ──────────────────────────────────────────────────────────

export async function scanDbName(surface: ScanSurface, staffKey: string | null, eventId: string): Promise<string> {
  const key = staffKey?.trim() ? (surface === 'embed' ? staffKey.trim().toLowerCase() : staffKey.trim()) : null
  const scope = key ? (await sha256Hex(key)).slice(0, 16) : 'anon'
  return `${SCAN_DB_PREFIX}${surface}:${scope}:${eventId}`
}

function readRegistry(): string[] {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY)
    const names = raw ? JSON.parse(raw) : []
    return Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : []
  } catch {
    return []
  }
}

function writeRegistry(names: string[]) {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify([...new Set(names)]))
  } catch {
    // Storage unavailable (partitioned iframe, private mode): indexedDB.databases() still finds them.
  }
}

const open = new Map<string, SessionScanDB>()

export function openScanDb(name: string): SessionScanDB {
  let db = open.get(name)
  if (!db) {
    db = new SessionScanDB(name)
    open.set(name, db)
    writeRegistry([...readRegistry(), name])
  }
  return db
}

// Every prezva-scan database this browser holds (databases() where supported,
// plus the names this origin recorded when it opened them).
export async function listScanDbNames(): Promise<string[]> {
  const names = new Set(readRegistry().filter(n => n.startsWith(SCAN_DB_PREFIX)))
  try {
    const all = await indexedDB.databases?.()
    for (const d of all ?? []) if (d.name?.startsWith(SCAN_DB_PREFIX)) names.add(d.name)
  } catch {
    // Not supported: the registry is all there is.
  }
  return [...names]
}

// Pending entries across every prezva-scan database (the sign-out warning).
export async function countPendingEverywhere(): Promise<number> {
  let total = 0
  for (const name of await listScanDbNames()) {
    try {
      total += await openScanDb(name).queue.where('status').equals('pending').count()
    } catch (e) {
      console.error('[scan-db] could not read', name, e)
    }
  }
  return total
}

// Sign-out: delete every prezva-scan database on this browser.
export async function deleteAllScanDbs(): Promise<void> {
  for (const name of await listScanDbNames()) {
    try {
      const db = open.get(name)
      if (db) {
        db.close()
        open.delete(name)
      }
      await Dexie.delete(name)
    } catch (e) {
      console.error('[scan-db] could not delete', name, e)
    }
  }
  writeRegistry([])
}

// ── Pack ─────────────────────────────────────────────────────────────────────

export async function savePack(
  db: SessionScanDB,
  sessionId: string,
  pack: OfflineSessionPack,
  receivedAtMs: number = Date.now(),
): Promise<void> {
  const serverNow = Date.parse(pack.serverNow)
  await db.transaction('rw', db.meta, db.list, async () => {
    await db.meta.put({
      sessionId,
      grant: pack.grant,
      fetchedAt: new Date(receivedAtMs).toISOString(),
      serverOffsetMs: Number.isNaN(serverNow) ? 0 : serverNow - receivedAtMs,
      eventEndsAt: pack.eventEndsAt,
    })
    await db.list.where('sessionId').equals(sessionId).delete()
    await db.list.bulkPut(pack.attendees.map((a: OfflinePackAttendee) => ({ sessionId, ...a })))
  })
}

// The grant's exp (seconds) → ms, or null when it cannot be read.
export function grantExpiresAtMs(grant: string): number | null {
  try {
    const payload = grant.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const exp = (JSON.parse(json) as { exp?: unknown }).exp
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

export type PackState =
  | { state: 'none' }
  | { state: 'expired'; meta: PackMetaRow }
  | { state: 'stale'; meta: PackMetaRow }
  | { state: 'ready'; meta: PackMetaRow }

export async function getPackState(db: SessionScanDB, sessionId: string, nowMs: number = Date.now()): Promise<PackState> {
  const meta = await db.meta.get(sessionId)
  if (!meta) return { state: 'none' }
  // Judge the grant against the server's clock as last seen.
  const exp = grantExpiresAtMs(meta.grant)
  if (exp !== null && exp <= nowMs + meta.serverOffsetMs) return { state: 'expired', meta }
  if (nowMs - Date.parse(meta.fetchedAt) >= PACK_MAX_AGE_MS) return { state: 'stale', meta }
  return { state: 'ready', meta }
}

// After the event's end + 24h the list and meta go; queued entries never do.
export async function clearFinishedEvents(db: SessionScanDB, nowMs: number = Date.now()): Promise<void> {
  const metas = await db.meta.toArray()
  for (const m of metas) {
    const end = m.eventEndsAt ? Date.parse(m.eventEndsAt) : NaN
    if (Number.isNaN(end) || nowMs < end + LIST_KEEP_AFTER_EVENT_MS) continue
    await db.transaction('rw', db.meta, db.list, async () => {
      await db.list.where('sessionId').equals(m.sessionId).delete()
      await db.meta.delete(m.sessionId)
    })
  }
}

// ── Local lookup ─────────────────────────────────────────────────────────────

export async function findByScan(db: SessionScanDB, sessionId: string, raw: string): Promise<ListRow | null> {
  const { field, hash } = await hashScan(raw)
  return (await db.list.where(`[sessionId+${field}]`).equals([sessionId, hash]).first()) ?? null
}

export async function findByRegistration(db: SessionScanDB, sessionId: string, registrationId: string): Promise<ListRow | null> {
  return (await db.list.get([sessionId, registrationId])) ?? null
}

// Checked in on the list, or already queued (and not refused) on this device.
export async function isCheckedInLocally(db: SessionScanDB, sessionId: string, registrationId: string): Promise<boolean> {
  const row = await findByRegistration(db, sessionId, registrationId)
  if (row?.checkedInAt) return true
  const queued = await db.queue.where('[sessionId+registrationId]').equals([sessionId, registrationId])
    .filter(q => q.status === 'pending' || q.status === 'synced')
    .count()
  return queued > 0
}

export async function listLocal(db: SessionScanDB, sessionId: string): Promise<ListRow[]> {
  const rows = await db.list.where('sessionId').equals(sessionId).toArray()
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export function matchesSearch(row: { name: string; email: string }, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || row.name.toLowerCase().includes(q) || row.email.toLowerCase().includes(q)
}

// ── Queue ────────────────────────────────────────────────────────────────────

export async function enqueue(
  db: SessionScanDB,
  entry: Omit<QueueRow, 'entryId' | 'status' | 'scannedAt'> & { scannedAt?: string },
): Promise<QueueRow> {
  const row: QueueRow = {
    ...entry,
    entryId: crypto.randomUUID(),
    scannedAt: entry.scannedAt ?? new Date().toISOString(),
    status: 'pending',
  }
  await db.transaction('rw', db.queue, db.list, async () => {
    await db.queue.add(row)
    // Mark the attendee in on this device right away (scan / manual / override).
    if (row.registrationId && row.kind !== 'recheck') {
      await db.list.where('[sessionId+registrationId]').equals([row.sessionId, row.registrationId])
        .modify({ checkedInAt: row.scannedAt })
    }
  })
  return row
}

export interface QueueSummary {
  pending: number
  pendingVerification: number
  needsAttention: QueueRow[]
}

export async function queueSummary(db: SessionScanDB, sessionId: string): Promise<QueueSummary> {
  const pendingRows = await db.queue.where('[sessionId+status]').equals([sessionId, 'pending']).toArray()
  const needsAttention = await db.queue.where('[sessionId+status]').equals([sessionId, 'needs_attention']).sortBy('scannedAt')
  return {
    pending: pendingRows.length,
    pendingVerification: pendingRows.filter(r => r.kind === 'recheck').length,
    needsAttention,
  }
}

// Staff acknowledged a refused entry: kept as 'dismissed', token deleted.
export async function dismissQueueEntry(db: SessionScanDB, entryId: string): Promise<void> {
  await db.queue.where('entryId').equals(entryId)
    .and(r => r.status === 'needs_attention')
    .modify(r => { r.status = 'dismissed'; delete r.token })
}

// ── Sync ─────────────────────────────────────────────────────────────────────

export interface SessionSyncOutcome {
  // false: a request failed (network, non-OK) — the entries it carried are unchanged.
  ok: boolean
  synced: number
  needsAttention: number
  // The server answered 401 session_expired: everything stays pending.
  sessionExpired: boolean
}

type EntryBody =
  | { kind: 'scan' | 'recheck'; entryId: string; scannedAt: string; token: string }
  | { kind: 'manual' | 'override'; entryId: string; scannedAt: string; registrationId: string }

function entryBody(r: QueueRow): EntryBody | null {
  if (r.kind === 'scan' || r.kind === 'recheck') {
    return r.token ? { kind: r.kind, entryId: r.entryId, scannedAt: r.scannedAt, token: r.token } : null
  }
  return r.registrationId
    ? { kind: r.kind, entryId: r.entryId, scannedAt: r.scannedAt, registrationId: r.registrationId }
    : null
}

// Sends this session's pending entries in batches of MAX_SYNC_ENTRIES, grouped
// by the grant they were queued under. Results are matched by entryId only.
export async function syncSessionQueue(
  db: SessionScanDB,
  opts: { url: string; sessionId: string; deviceId: string },
): Promise<SessionSyncOutcome> {
  const outcome: SessionSyncOutcome = { ok: true, synced: 0, needsAttention: 0, sessionExpired: false }
  const pending = await db.queue.where('[sessionId+status]').equals([opts.sessionId, 'pending']).sortBy('scannedAt')
  if (pending.length === 0) return outcome
  const fallbackGrant = (await db.meta.get(opts.sessionId))?.grant

  const byGrant = new Map<string, QueueRow[]>()
  for (const row of pending) {
    const grant = row.grant ?? fallbackGrant
    if (!grant) continue // Nothing to authorise it with yet; stays pending.
    byGrant.set(grant, [...(byGrant.get(grant) ?? []), row])
  }

  for (const [grant, rows] of byGrant) {
    for (let i = 0; i < rows.length; i += MAX_SYNC_ENTRIES) {
      const chunk = rows.slice(i, i + MAX_SYNC_ENTRIES)
      const bodies = chunk.map(entryBody).filter((b): b is EntryBody => b !== null)
      if (bodies.length === 0) continue
      let body: OfflineSyncResponse
      try {
        const res = await fetch(opts.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: opts.deviceId, deviceNow: new Date().toISOString(), grant, entries: bodies }),
        })
        if (res.status === 401) {
          const err = await res.json().catch(() => null) as { code?: string } | null
          return { ...outcome, ok: false, sessionExpired: err?.code === 'session_expired' }
        }
        if (!res.ok) return { ...outcome, ok: false }
        body = await res.json() as OfflineSyncResponse
      } catch {
        return { ...outcome, ok: false }
      }
      if (!Array.isArray(body?.results)) return { ...outcome, ok: false }
      await applyResults(db, chunk, body.results, outcome)
    }
  }
  return outcome
}

async function applyResults(
  db: SessionScanDB,
  chunk: QueueRow[],
  results: OfflineEntryResult[],
  outcome: SessionSyncOutcome,
): Promise<void> {
  const sent = new Map(chunk.map(r => [r.entryId, r]))
  await db.transaction('rw', db.queue, async () => {
    for (const r of results) {
      const row = sent.get(r?.entryId)
      if (!row) continue
      sent.delete(r.entryId)
      if (r.status === 'accepted' || r.status === 'already_checked_in') {
        await db.queue.where('entryId').equals(row.entryId).modify(q => {
          q.status = 'synced'
          delete q.token
          delete q.reason
        })
        outcome.synced++
      } else if (r.status === 'refused') {
        await db.queue.update(row.entryId, {
          status: 'needs_attention',
          reason: typeof r.reason === 'string' && r.reason ? r.reason : 'Refused by the server',
        })
        outcome.needsAttention++
      }
      // 'retry' or anything unknown: stays pending.
    }
  })
}

// A token shown to staff: never in full.
export function truncateToken(token: string): string {
  return token.length > 8 ? `${token.slice(0, 6)}…` : `${token.slice(0, 2)}…`
}

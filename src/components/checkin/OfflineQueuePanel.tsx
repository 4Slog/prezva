'use client'

import type { PendingCheckIn } from '@/lib/checkin/offline-db'

// Door name-search check-in threw (no network). Not queued offline.
export const MANUAL_CHECKIN_FAILED = 'Could not check in — check the connection and try again'

// A QR code is a check-in credential: never shown in full.
export function truncateQr(code: string): string {
  return code.length > 8 ? `${code.slice(0, 6)}…` : `${code.slice(0, 2)}…`
}

function formatScanTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Unknown time'
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

interface QueueStatusProps {
  isOnline: boolean
  pendingCount: number
  // Session scanners (R85): how many pending entries are re-checks.
  pendingVerificationCount?: number
  needsAttentionCount: number
  syncing: boolean
  onSync: () => void
}

// Header widget: connection, pending count with Sync now, needs-attention count.
export function OfflineQueueStatus({ isOnline, pendingCount, pendingVerificationCount = 0, needsAttentionCount, syncing, onSync }: QueueStatusProps) {
  return (
    <div className="flex-shrink-0 text-right">
      <div className="flex items-center gap-2 justify-end">
        <span className={`inline-block w-2 h-2 rounded-full ${isOnline ? 'bg-[var(--pz-success-fill)]' : 'bg-[var(--pz-error)]'}`} />
        <span className="text-xs text-[var(--pz-muted)]">{isOnline ? 'Online' : 'Offline'}</span>
      </div>
      {pendingCount > 0 && (
        <div className="mt-1">
          <span className="text-xs text-yellow-600 font-medium">
            {pendingCount} pending
            {pendingVerificationCount > 0 && ` (${pendingVerificationCount} pending verification)`}
          </span>
          {isOnline && (
            <button
              onClick={onSync}
              disabled={syncing}
              className="ml-2 text-xs underline disabled:opacity-50"
              style={{ color: 'var(--pz-teal-ink)' }}
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          )}
        </div>
      )}
      {needsAttentionCount > 0 && (
        <div className="mt-1">
          <span className="text-xs text-red-700 font-medium">{needsAttentionCount} need{needsAttentionCount === 1 ? 's' : ''} attention</span>
        </div>
      )}
    </div>
  )
}

export interface AttentionItem {
  key: string
  // The attendee name, or a truncated token — never a full token.
  label: string
  mono?: boolean
  scannedAt: string
  reason?: string
}

interface AttentionListProps {
  items: AttentionItem[]
  onDismiss: (key: string) => void
  noun?: string
}

// Queued entries the server refused, with its reason. Dismiss keeps the entry on
// the device (status 'dismissed') and hides it here.
export function AttentionList({ items, onDismiss, noun = 'scan' }: AttentionListProps) {
  if (items.length === 0) return null
  return (
    <div className="p-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-800 space-y-2">
      <p className="font-medium">
        {items.length} queued {noun}{items.length === 1 ? '' : 's'} could not be checked in
      </p>
      <ul className="space-y-1">
        {items.map(e => (
          <li key={e.key} className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className={e.mono ? 'font-mono text-xs' : 'text-xs font-medium'}>{e.label}</span>
              <span className="text-xs"> · scanned {formatScanTime(e.scannedAt)} · {e.reason ?? 'Refused'}</span>
            </span>
            <button onClick={() => onDismiss(e.key)} className="flex-shrink-0 text-xs underline">
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface NeedsAttentionListProps {
  entries: PendingCheckIn[]
  onDismiss: (id: number) => void
}

// The door queue's list (R84).
export function NeedsAttentionList({ entries, onDismiss }: NeedsAttentionListProps) {
  const items: AttentionItem[] = entries
    .filter(e => e.id !== undefined)
    .map(e => ({ key: String(e.id), label: truncateQr(e.qrCode ?? ''), mono: true, scannedAt: e.scannedAt, reason: e.reason }))
  return <AttentionList items={items} onDismiss={key => onDismiss(Number(key))} />
}

'use client'

import type { PendingCheckIn } from '@/lib/checkin/offline-db'

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
  needsAttentionCount: number
  syncing: boolean
  onSync: () => void
}

// Header widget: connection, pending count with Sync now, needs-attention count.
export function OfflineQueueStatus({ isOnline, pendingCount, needsAttentionCount, syncing, onSync }: QueueStatusProps) {
  return (
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

interface NeedsAttentionListProps {
  entries: PendingCheckIn[]
  onDismiss: (id: number) => void
}

// Queued scans the server refused, with its reason. Dismiss keeps the entry on
// the device (status 'dismissed') and hides it here.
export function NeedsAttentionList({ entries, onDismiss }: NeedsAttentionListProps) {
  if (entries.length === 0) return null
  return (
    <div className="p-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-800 space-y-2">
      <p className="font-medium">
        {entries.length} queued scan{entries.length === 1 ? '' : 's'} could not be checked in
      </p>
      <ul className="space-y-1">
        {entries.map(e => (
          <li key={e.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="font-mono text-xs">{truncateQr(e.qrCode)}</span>
              <span className="text-xs"> · scanned {formatScanTime(e.scannedAt)} · {e.reason ?? 'Refused'}</span>
            </span>
            {e.id !== undefined && (
              <button
                onClick={() => onDismiss(e.id as number)}
                className="flex-shrink-0 text-xs underline"
              >
                Dismiss
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

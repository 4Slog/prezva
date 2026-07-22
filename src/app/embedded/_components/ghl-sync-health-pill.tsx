'use client'

import { useState, useTransition } from 'react'
import { acknowledgeSyncIssue } from '@/lib/embedded/event-actions'
import { translateSyncError } from '@/lib/ghl/sync-health'
import type { SyncHealthResult, SyncHealthState } from '@/lib/ghl/sync-health'

type Props = SyncHealthResult

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const TONE = {
  red: { dot: 'pz-dot-offline', text: 'var(--pz-error)', bg: 'var(--pz-error-bg)', border: 'var(--pz-error)' },
  yellow: { dot: 'pz-dot-warning', text: 'var(--pz-warning)', bg: 'var(--pz-warning-bg)', border: 'var(--pz-warning-fill)' },
  green: { dot: 'pz-dot-online', text: 'var(--pz-success)', bg: 'var(--pz-success-bg)', border: 'var(--pz-success-fill)' },
} as const

export function GhlSyncHealthPill({ rows: initialRows }: Props) {
  const [rows, setRows] = useState(initialRows)
  const [expanded, setExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [ackingId, setAckingId] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  const redCount = rows.filter(r => r.severity === 'red').length
  const yellowCount = rows.filter(r => r.severity === 'yellow').length
  const state: SyncHealthState = redCount > 0 ? 'red' : yellowCount > 0 ? 'yellow' : 'green'
  const clickable = state !== 'green'
  const tone = TONE[state]

  const label = state === 'red'
    ? `${redCount} sync issue${redCount === 1 ? '' : 's'}`
    : state === 'yellow'
      ? `${yellowCount} warning${yellowCount === 1 ? '' : 's'}`
      : 'Sync healthy'

  function handleAcknowledge(rowId: string) {
    setAckingId(rowId)
    startTransition(async () => {
      const result = await acknowledgeSyncIssue(rowId)
      if ('error' in result) {
        setRowErrors(prev => ({ ...prev, [rowId]: result.error }))
      } else {
        setRows(prev => prev.filter(r => r.id !== rowId))
        setRowErrors(prev => {
          const next = { ...prev }
          delete next[rowId]
          return next
        })
      }
      setAckingId(null)
    })
  }

  return (
    <div className="relative flex shrink-0 flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => clickable && setExpanded(o => !o)}
        disabled={!clickable}
        className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-opacity disabled:cursor-default"
        style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.text }}
      >
        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${tone.dot}`} />
        {label}
        {clickable && (
          <svg
            className="h-3 w-3"
            style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z" />
          </svg>
        )}
      </button>

      {clickable && expanded && (
        <div
          className="absolute right-0 top-full z-10 flex w-80 flex-col gap-2 rounded-xl border p-3 shadow-lg"
          style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}
        >
          {rows.map(row => {
            const severityColor = row.severity === 'red' ? 'var(--pz-error)' : 'var(--pz-warning)'
            const acking = ackingId === row.id && isPending
            return (
              <div
                key={row.id}
                className="flex flex-col gap-1.5 rounded-lg p-2.5"
                style={{ background: 'var(--pz-surface-2)', borderLeft: `3px solid ${severityColor}` }}
              >
                <p className="text-xs font-medium" style={{ color: 'var(--pz-text)' }}>
                  {translateSyncError(row.last_error, row.status)}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--pz-muted)' }}>
                  {row.last_error ?? row.status}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--pz-muted)' }}>
                  Created {formatTimestamp(row.created_at)} · Updated {formatTimestamp(row.updated_at)}
                </p>
                {rowErrors[row.id] && (
                  <p className="text-[11px]" style={{ color: 'var(--pz-error)' }}>{rowErrors[row.id]}</p>
                )}
                <button
                  type="button"
                  onClick={() => handleAcknowledge(row.id)}
                  disabled={acking}
                  className="self-start rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
                >
                  {acking ? 'Acknowledging…' : 'Acknowledge'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

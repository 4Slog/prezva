'use client'

import { useState } from 'react'

interface DeadLetterItem {
  id: string
  type: string
  payload: Record<string, unknown>
  error_message: string | null
  retry_count: number
  first_failed_at: string
  last_failed_at: string
  resolved_at: string | null
}

interface Props {
  items: DeadLetterItem[]
  eventSlug: string
}

export function DeadLettersClient({ items: initial, eventSlug }: Props) {
  const [items, setItems] = useState<DeadLetterItem[]>(initial)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const unresolved = items.filter(i => !i.resolved_at)
  const resolved = items.filter(i => i.resolved_at)

  async function handleResolve(id: string) {
    setLoading(id)
    try {
      const res = await fetch(`/api/events/${eventSlug}/dead-letters/${id}/resolve`, { method: 'POST' })
      if (res.ok) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, resolved_at: new Date().toISOString() } : i))
        setMsg('Item marked as resolved.')
      }
    } finally { setLoading(null) }
  }

  async function handleReplay(id: string) {
    setLoading(id)
    try {
      const res = await fetch(`/api/events/${eventSlug}/dead-letters/${id}/replay`, { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        setMsg(`Replay enqueued: ${json.message ?? 'success'}`)
      } else {
        setMsg(`Replay failed: ${json.error}`)
      }
    } finally { setLoading(null) }
  }

  const fmtTime = (d: string) =>
    new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  function renderTable(rows: DeadLetterItem[], showResolved: boolean) {
    if (rows.length === 0) return (
      <p style={{ color: 'var(--pz-muted)', fontSize: 13, padding: '1rem 0' }}>
        {showResolved ? 'No resolved items.' : 'No unresolved items.'}
      </p>
    )
    return (
      <div style={{ border: '1px solid var(--pz-border)', borderRadius: 10, overflow: 'hidden' }}>
        {rows.map((item, i) => (
          <div key={item.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--pz-border)' : 'none', background: showResolved ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, background: showResolved ? '#1e3a5f' : 'rgba(239,68,68,0.15)', color: showResolved ? '#64748b' : '#ef4444', padding: '2px 8px', borderRadius: 4 }}>
                    {item.type}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--pz-muted)' }}>
                    {item.retry_count} retries · last failed {fmtTime(item.last_failed_at)}
                  </span>
                </div>
                {item.error_message && (
                  <p style={{ fontSize: 12, color: '#ef4444', fontFamily: 'monospace', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>
                    {item.error_message}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  style={{ fontSize: 12, color: 'var(--pz-muted)', background: 'none', border: '1px solid var(--pz-border)', padding: '4px 10px', borderRadius: 4, cursor: 'pointer' }}
                >
                  {expanded === item.id ? 'Hide' : 'Payload'}
                </button>
                {!showResolved && (
                  <>
                    <button
                      onClick={() => handleReplay(item.id)}
                      disabled={loading === item.id}
                      style={{ fontSize: 12, color: '#0ea5e9', background: 'none', border: '1px solid #0ea5e9', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', opacity: loading === item.id ? 0.5 : 1 }}
                    >
                      Replay
                    </button>
                    <button
                      onClick={() => handleResolve(item.id)}
                      disabled={loading === item.id}
                      style={{ fontSize: 12, color: '#10b981', background: 'none', border: '1px solid #10b981', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', opacity: loading === item.id ? 0.5 : 1 }}
                    >
                      Resolve
                    </button>
                  </>
                )}
              </div>
            </div>
            {expanded === item.id && (
              <div style={{ padding: '0 16px 12px', fontFamily: 'monospace', fontSize: 11, color: 'var(--pz-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(item.payload, null, 2)}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pz-text)', marginBottom: 4 }}>
            Failed Jobs
          </h1>
          <p style={{ fontSize: 13, color: 'var(--pz-muted)' }}>
            {unresolved.length} unresolved · {resolved.length} resolved
          </p>
        </div>
      </div>

      {msg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(0,191,166,0.1)', border: '1px solid rgba(0,191,166,0.3)', fontSize: 13, color: 'var(--pz-teal)' }}>
          {msg}
        </div>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 12 }}>
          Unresolved ({unresolved.length})
        </h2>
        {renderTable(unresolved, false)}
      </section>

      {resolved.length > 0 && (
        <section>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-muted)', marginBottom: 12 }}>
            Resolved ({resolved.length})
          </h2>
          {renderTable(resolved, true)}
        </section>
      )}
    </div>
  )
}

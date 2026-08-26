'use client'

import { useState } from 'react'
import { bulkIssueCertificates } from '@/lib/certificates/bulk-issue'
import { Gated } from '@/components/auth/Gated'

// R62. Both bulk doors now enqueue a background sweep and return the number of
// attendees queued — never a completed count, because at the moment this
// component gets its answer nothing has been issued yet.
type BulkResult = { queued: number } | { error: string }

interface Props {
  eventId: string
  // Renamed from eligibleCount in R62, and the rename is the point: both mount
  // sites passed a hardcoded 0 under the old name, and the name is what stopped
  // anyone noticing. This is the count of CONFIRMED registrations — exactly the
  // set the sweep queues — and it is not a count of eligible attendees.
  // Eligibility is decided per registration inside the sweep. Do not describe
  // this number as "eligible" in any copy below.
  confirmedCount: number
  permissions: string[]
  embed?: boolean
  embedAction?: (eventId: string) => Promise<BulkResult>
}

export default function BulkIssueButton({ eventId, confirmedCount, permissions, embed, embedAction }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)

  async function handleIssue() {
    setLoading(true)
    try {
      const r = await (embed && embedAction ? embedAction(eventId) : bulkIssueCertificates(eventId))
      setResult(r)
    } catch {
      // BOTH doors still throw on an authorization failure — the dashboard's
      // assertPermission, and the embed's resolveEmbedContext /
      // assertEventOwnership. Those paths never return { error }, so without
      // this catch the rejection escapes, setLoading(false) never runs, and the
      // modal sits on a disabled "Queueing…" button forever with no explanation
      // — the most likely real trigger being an embed session cookie that
      // expired between page load and click.
      setResult({ error: 'unavailable' })
    } finally {
      setLoading(false)
      setOpen(false)
    }
  }

  // A sweep is already queued (or in flight) — a second click would enqueue a
  // second sweep over the same event. The work is idempotent per registration
  // (issueCertificateCore returns the existing certificate rather than issuing
  // twice), so this is not a correctness guard; it is there so an organizer
  // watching a panel that says "queued" cannot double the queue depth by
  // clicking again.
  const queued = !!result && 'queued' in result
  const disabled = loading || queued

  const triggerButton = (
    <button
      onClick={() => setOpen(true)}
      disabled={disabled}
      style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}
    >
      Issue to eligible attendees
    </button>
  )

  return (
    <>
      {embed ? triggerButton : (
        <Gated permission="certificates.manage" perms={permissions} mode="disable">
          {triggerButton}
        </Gated>
      )}

      {result && 'queued' in result && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--pz-teal-bg)', border: '1px solid var(--pz-teal)', borderRadius: 8, fontSize: 13, color: 'var(--pz-text)' }}>
          Queued {result.queued} {result.queued === 1 ? 'attendee' : 'attendees'}. Issuing runs in the background — certificates will appear here as they are created.
        </div>
      )}

      {/* An error result must never render the success panel above. The old
          panel reported issued/skipped/failed counts it had actually observed;
          this one reports an intention, so a failed enqueue that fell through
          to it would claim work that was never scheduled. */}
      {result && 'error' in result && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: 8, fontSize: 13, color: 'var(--pz-text)' }}>
          {result.error === 'queue-unavailable'
            ? 'Could not start issuing — the background job queue is unavailable. Nothing was issued. Try again in a few minutes.'
            : result.error === 'event-not-found'
              ? 'Could not start issuing — this event could not be found. Nothing was issued.'
              : 'Could not start issuing — your session may have expired, or you may not have permission. Nothing was issued. Reload the page and try again.'}
        </div>
      )}

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: 12, padding: 28, maxWidth: 400, width: '100%' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 12 }}>Issue certificates</h2>
            <p style={{ fontSize: 14, color: 'var(--pz-muted)', marginBottom: 20 }}>
              This will queue {confirmedCount} confirmed {confirmedCount === 1 ? 'attendee' : 'attendees'}. Anyone who does not meet the eligibility requirements will be skipped, and already-issued certificates will not be duplicated.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setOpen(false)} disabled={loading} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--pz-border)', background: 'none', color: 'var(--pz-muted)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleIssue} disabled={loading} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Queueing…' : 'Issue now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

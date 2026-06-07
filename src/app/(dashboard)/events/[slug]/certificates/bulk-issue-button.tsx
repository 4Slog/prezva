'use client'

import { useState } from 'react'
import { bulkIssueCertificates } from '@/lib/certificates/bulk-issue'
import { Gated } from '@/components/auth/Gated'

export default function BulkIssueButton({ eventId, eligibleCount, permissions }: { eventId: string; eligibleCount: number; permissions: string[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ issued: number; skipped: number; failed: number } | null>(null)

  async function handleIssue() {
    setLoading(true)
    const r = await bulkIssueCertificates(eventId)
    setLoading(false)
    setResult(r)
    setOpen(false)
  }

  return (
    <>
      <Gated permission="certificates.manage" perms={permissions} mode="disable">
        <button
          onClick={() => setOpen(true)}
          style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
        >
          Issue to eligible attendees
        </button>
      </Gated>

      {result && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--pz-teal-bg)', border: '1px solid var(--pz-teal)', borderRadius: 8, fontSize: 13, color: 'var(--pz-text)' }}>
          Done: {result.issued} issued, {result.skipped} skipped (not eligible), {result.failed} failed
        </div>
      )}

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: 12, padding: 28, maxWidth: 400, width: '100%' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 12 }}>Issue certificates</h2>
            <p style={{ fontSize: 14, color: 'var(--pz-muted)', marginBottom: 20 }}>
              This will issue certificates to all confirmed attendees who meet eligibility requirements. Already-issued certificates will not be duplicated.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setOpen(false)} disabled={loading} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--pz-border)', background: 'none', color: 'var(--pz-muted)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleIssue} disabled={loading} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Issuing…' : 'Issue now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

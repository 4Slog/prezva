'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function CertificateClient({ eventId }: { eventId: string }) {
  const [regId, setRegId] = useState<string | null>(null)
  const [certToken, setCertToken] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'eligible' | 'not_eligible' | 'no_reg' | 'error'>('loading')
  const [reason, setReason] = useState('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setStatus('no_reg'); return }

      const { data: reg } = await supabase
        .from('registrations')
        .select('id, certificate_token')
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .eq('status', 'confirmed')
        .maybeSingle()

      if (!reg) { setStatus('no_reg'); return }

      setRegId(reg.id)
      setCertToken(reg.certificate_token)

      // Check eligibility via API
      const res = await fetch(`/api/certificates/${reg.id}?token=${reg.certificate_token}`, { method: 'HEAD' }).catch(() => null)
      if (!res) { setStatus('error'); return }

      if (res.status === 412) {
        setStatus('not_eligible')
        setReason('Your certificate isn\'t ready yet. Certificates are issued after the event ends and once attendance requirements are met.')
      } else if (res.status === 200) {
        setStatus('eligible')
      } else if (res.status === 404) {
        setStatus('no_reg')
      } else {
        setStatus('error')
      }
    }
    check()
  }, [eventId])

  async function download() {
    if (!regId || !certToken) return
    setDownloading(true)
    window.open(`/api/certificates/${regId}?token=${certToken}`, '_blank')
    setDownloading(false)
  }

  if (status === 'loading') {
    return (
      <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '2rem', textAlign: 'center', color: 'var(--pz-muted)', fontSize: 14 }}>
        Checking your certificate status…
      </div>
    )
  }

  if (status === 'no_reg') {
    return (
      <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '2rem', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--pz-muted)' }}>
          No confirmed registration found for this event under your account.
        </p>
      </div>
    )
  }

  if (status === 'not_eligible') {
    return (
      <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '2rem' }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 8 }}>Not yet available</p>
        <p style={{ fontSize: 13, color: 'var(--pz-muted)' }}>{reason}</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '2rem', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--pz-error)' }}>Something went wrong. Please try again later.</p>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-teal)', borderRadius: 10, padding: '2rem', textAlign: 'center' }}>
      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 6 }}>Your certificate is ready!</p>
      <p style={{ fontSize: 13, color: 'var(--pz-muted)', marginBottom: 20 }}>
        Download your personalized Certificate of Attendance as a PDF.
      </p>
      <button
        onClick={download}
        disabled={downloading}
        style={{ padding: '10px 28px', background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: downloading ? 'not-allowed' : 'pointer', opacity: downloading ? 0.7 : 1 }}
      >
        {downloading ? 'Opening…' : 'Download PDF certificate'}
      </button>
    </div>
  )
}

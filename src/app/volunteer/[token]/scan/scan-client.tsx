'use client'

import { useState, useRef, useEffect } from 'react'

interface Props { token: string; volunteerName: string }

interface ScanResult {
  ok: boolean
  already_checked_in?: boolean
  attendee_name?: string
  ticket_type_name?: string
  error?: string
}

export function VolunteerScanClient({ token, volunteerName }: Props) {
  const [result, setResult] = useState<ScanResult | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus the manual input — barcode scanners type into focused inputs
  useEffect(() => { inputRef.current?.focus() }, [])

  async function submitCode(code: string) {
    if (!code.trim() || loading) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/volunteer/${token}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_code: code.trim() }),
      })
      const json: ScanResult = await res.json()
      setResult(json)
      setManualCode('')
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') submitCode(manualCode)
  }

  const resultColor =
    !result ? undefined :
    result.error ? '#EF4444' :
    result.already_checked_in ? '#F59E0B' :
    '#00BFA6'

  return (
    <div style={{ minHeight: '100vh', background: '#0D1B2A', color: '#F0F4F8', fontFamily: 'sans-serif' }}>
      <header style={{ background: '#112240', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 800, fontSize: 18, color: '#00BFA6' }}>P Prezva</span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Check-In Scanner</span>
      </header>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>
          Hi, {volunteerName.split(' ')[0]}. Scan or type a QR code to check in an attendee.
        </p>

        {/* Result display */}
        {result && (
          <div style={{ background: '#112240', border: `2px solid ${resultColor}`, borderRadius: 12, padding: '1.25rem', marginBottom: 20 }}>
            {result.error ? (
              <p style={{ color: '#EF4444', fontWeight: 700 }}>{result.error}</p>
            ) : result.already_checked_in ? (
              <>
                <p style={{ color: '#F59E0B', fontWeight: 700, marginBottom: 4 }}>Already checked in</p>
                <p style={{ fontSize: 18, fontWeight: 800 }}>{result.attendee_name}</p>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{result.ticket_type_name}</p>
              </>
            ) : (
              <>
                <p style={{ color: '#00BFA6', fontWeight: 700, marginBottom: 4 }}>Checked in!</p>
                <p style={{ fontSize: 18, fontWeight: 800 }}>{result.attendee_name}</p>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{result.ticket_type_name}</p>
              </>
            )}
          </div>
        )}

        {/* Manual / barcode scanner input */}
        <div style={{ background: '#112240', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '1.25rem' }}>
          <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            QR Code
          </label>
          <input
            ref={inputRef}
            type="text"
            value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scan or type code…"
            style={{
              width: '100%', boxSizing: 'border-box', background: '#0D1B2A', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8, padding: '10px 12px', fontSize: 14, color: '#F0F4F8', outline: 'none', marginBottom: 12,
            }}
          />
          <button
            onClick={() => submitCode(manualCode)}
            disabled={loading || !manualCode.trim()}
            style={{
              width: '100%', background: '#00BFA6', color: '#0D1B2A', padding: '12px', borderRadius: 8,
              fontWeight: 700, fontSize: 15, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Checking in…' : 'Check In'}
          </button>
        </div>

        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 32 }}>
          Powered by Prezva · Volunteer portal
        </p>
      </div>
    </div>
  )
}

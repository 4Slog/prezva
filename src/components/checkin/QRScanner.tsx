'use client'
import { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'

type ScanState = 'prompt' | 'scanning' | 'denied' | 'manual'

interface QRScannerProps {
  onScan: (code: string) => void
  active: boolean
}

export function QRScanner({ onScan, active }: QRScannerProps) {
  const divRef = useRef<HTMLDivElement>(null)
  const scannerRef = useRef<any>(null)
  const [state, setState] = useState<ScanState>('prompt')
  const [manualCode, setManualCode] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (state !== 'scanning' || !active) return
    let mounted = true

    async function init() {
      // Prompt for camera permission ourselves *before* loading html5-qrcode.
      // If we don't, the library renders its own "Request Camera Permissions"
      // button and the user has to click twice.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        // Release the stream — html5-qrcode opens its own once permission is granted.
        stream.getTracks().forEach(t => t.stop())
      } catch (err: any) {
        if (!mounted) return
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          setState('denied')
        } else {
          // No camera, hardware busy, insecure context, etc. — same fallback UX.
          setState('denied')
        }
        return
      }

      try {
        const { Html5QrcodeScanner } = await import('html5-qrcode')
        if (!mounted || !divRef.current) return
        const scanner = new Html5QrcodeScanner(
          'qr-reader',
          { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
          false,
        )
        scannerRef.current = scanner
        scanner.render(
          (decodedText: string) => { onScan(decodedText) },
          (_err: any) => {},
        )
        setReady(true)
      } catch {
        setState('denied')
      }
    }

    init()
    return () => {
      mounted = false
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {})
        scannerRef.current = null
      }
      setReady(false)
    }
  }, [state, active, onScan])

  // Auto-start if camera permission is already granted on mount
  useEffect(() => {
    if (!active) return
    try {
      navigator.permissions.query({ name: 'camera' as PermissionName }).then(result => {
        if (result.state === 'granted') setState('scanning')
        // Listen for changes — if user grants in browser settings, auto-start
        result.onchange = () => {
          if (result.state === 'granted') setState('scanning')
          if (result.state === 'denied') setState('denied')
        }
      }).catch(() => {
        // navigator.permissions not supported (iOS Safari) — fall through to prompt
      })
    } catch {
      // Silently fall through to prompt screen
    }
  }, [active])

  const [prevActive, setPrevActive] = useState(active)
  if (prevActive !== active) {
    setPrevActive(active)
    if (!active) setState('prompt')
  }

  if (!active) return null

  if (state === 'prompt') {
    return (
      <div style={{
        textAlign: 'center', padding: '2rem 1rem',
        background: 'var(--pz-surface)', borderRadius: 12,
        border: '1px solid var(--pz-border)'
      }}>
        <div style={{ marginBottom: 12 }}><Camera size={48} /></div>
        <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--pz-text)', margin: '0 0 8px' }}>
          Camera access needed
        </p>
        <p style={{ fontSize: 13, color: 'var(--pz-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
          Prezva needs your camera to scan attendee QR codes.
          You&apos;ll see a browser permission prompt — tap <strong>Allow</strong> to continue.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 280, margin: '0 auto' }}>
          <button
            onClick={() => setState('scanning')}
            style={{
              padding: '0.75rem', borderRadius: 10, border: 'none',
              background: 'var(--pz-teal)', color: 'var(--pz-on-accent)',
              fontWeight: 700, fontSize: 15, cursor: 'pointer'
            }}
          >
            Allow camera access
          </button>
          <button
            onClick={() => setState('manual')}
            style={{
              padding: '0.625rem', borderRadius: 10, fontSize: 13,
              border: '1px solid var(--pz-border)', background: 'transparent',
              color: 'var(--pz-muted)', cursor: 'pointer'
            }}
          >
            Enter code manually instead
          </button>
        </div>
      </div>
    )
  }

  if (state === 'denied' || state === 'manual') {
    return (
      <div style={{
        padding: '1.5rem', background: 'var(--pz-surface)',
        borderRadius: 12, border: '1px solid var(--pz-border)'
      }}>
        {state === 'denied' && (
          <div style={{
            background: 'var(--pz-error-bg)', border: '1px solid var(--pz-error)',
            borderRadius: 8, padding: '0.75rem', marginBottom: '1rem'
          }}>
            <p style={{ fontSize: 13, color: 'var(--pz-error)', margin: 0 }}>
              Camera access was denied. You can enter the attendee QR code manually below,
              or enable camera access in your browser settings and refresh.
            </p>
          </div>
        )}
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', margin: '0 0 8px' }}>
          Enter QR code manually
        </p>
        <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: '0 0 12px' }}>
          The QR code is printed on the attendee&apos;s confirmation email (format: PREZVA-XXXXXXXX)
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={manualCode}
            onChange={e => setManualCode(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter' && manualCode.trim()) { onScan(manualCode.trim()); setManualCode('') }}}
            placeholder="PREZVA-..."
            autoFocus
            style={{
              flex: 1, padding: '0.625rem 0.875rem', borderRadius: 8, fontSize: 14,
              border: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)',
              color: 'var(--pz-text)', fontFamily: 'monospace'
            }}
          />
          <button
            onClick={() => { if (manualCode.trim()) { onScan(manualCode.trim()); setManualCode('') }}}
            disabled={!manualCode.trim()}
            style={{
              padding: '0.625rem 1rem', borderRadius: 8, border: 'none',
              background: 'var(--pz-teal)', color: 'var(--pz-on-accent)',
              fontWeight: 700, cursor: 'pointer', fontSize: 14,
              opacity: manualCode.trim() ? 1 : 0.5
            }}
          >
            Check in
          </button>
        </div>
        {state === 'denied' && (
          <button
            onClick={() => setState('prompt')}
            style={{
              marginTop: 12, fontSize: 12, color: 'var(--pz-teal)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              textDecoration: 'underline'
            }}
          >
            Try camera again
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div
        id="qr-reader"
        ref={divRef}
        className="rounded-lg overflow-hidden border border-[var(--pz-border)]"
      />
      {!ready && (
        <p className="text-sm text-[var(--pz-muted)] text-center animate-pulse">
          Starting camera…
        </p>
      )}
      <button
        onClick={() => setState('manual')}
        style={{
          display: 'block', width: '100%', textAlign: 'center',
          fontSize: 12, color: 'var(--pz-muted)', background: 'none',
          border: 'none', cursor: 'pointer', padding: '4px', marginTop: 4,
          textDecoration: 'underline'
        }}
      >
        Having trouble? Enter code manually
      </button>
    </div>
  )
}

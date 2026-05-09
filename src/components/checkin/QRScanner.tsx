'use client'

import { useEffect, useRef, useState } from 'react'

interface QRScannerProps {
  onScan: (code: string) => void
  active: boolean
}

export function QRScanner({ onScan, active }: QRScannerProps) {
  const divRef = useRef<HTMLDivElement>(null)
  const scannerRef = useRef<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!active) return
    let mounted = true

    async function init() {
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
          (decodedText: string) => {
            onScan(decodedText)
          },
          (err: any) => {
            // scan failure — ignore, it fires on every frame without a QR
          },
        )
        setReady(true)
      } catch (e: any) {
        setError('Camera unavailable: ' + e.message)
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
  }, [active, onScan])

  if (!active) return null

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-md">{error}</p>
      )}
      <div
        id="qr-reader"
        ref={divRef}
        className="rounded-lg overflow-hidden border border-[var(--border)]"
      />
      {!ready && !error && (
        <p className="text-sm text-[var(--text-muted)] text-center animate-pulse">
          Starting camera…
        </p>
      )}
    </div>
  )
}

'use client'
import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

export default function QRDisplay({ qrCode }: { qrCode: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, qrCode, {
      width: 240,
      margin: 2,
      color: { dark: '#0D1B2A', light: '#FFFFFF' },
    })
  }, [qrCode])

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <canvas ref={canvasRef} style={{ borderRadius: 12, border: '4px solid #fff' }} />
    </div>
  )
}

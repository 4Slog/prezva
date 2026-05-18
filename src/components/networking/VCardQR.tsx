'use client'
import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

export default function VCardQR({ data }: { data: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, data, {
      width: 120,
      margin: 1,
      color: { dark: '#0D1B2A', light: '#FFFFFF' },
    })
  }, [data])

  return <canvas ref={canvasRef} style={{ borderRadius: 8, border: '3px solid #fff' }} />
}

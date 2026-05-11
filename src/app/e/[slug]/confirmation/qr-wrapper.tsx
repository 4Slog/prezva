'use client'

import QRDisplay from '../my-qr/qr-display'

export function ConfirmationQR({ qrCode }: { qrCode: string }) {
  return (
    <div className="mb-6">
      <QRDisplay qrCode={qrCode} />
      <p className="mt-2 font-mono text-xs tracking-wider" style={{ color: 'var(--pz-label)' }}>
        {qrCode}
      </p>
    </div>
  )
}

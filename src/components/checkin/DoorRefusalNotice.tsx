'use client'

import { Ban } from 'lucide-react'
import type { DoorRefusal } from '@/lib/checkin/admission'

// R90: a refused ticket at the door. Red, names the attendee, says why and what
// to do. There is no override from here.
export function DoorRefusalNotice({ refusal, variant = 'toast' }: { refusal: DoorRefusal; variant?: 'toast' | 'kiosk' }) {
  const kiosk = variant === 'kiosk'
  return (
    <div
      role="alert"
      data-testid="door-refusal"
      className={kiosk ? undefined : 'p-4 rounded-xl border bg-red-50 border-red-300 text-red-800'}
      style={kiosk ? {
        width: '100%', maxWidth: 560, marginBottom: '1rem', padding: '1rem', borderRadius: 12, textAlign: 'center',
        // eslint-disable-next-line no-restricted-syntax
        background: 'rgba(239,68,68,0.2)', border: '2px solid rgba(239,68,68,0.7)', color: '#FCA5A5',
      } : undefined}
    >
      <p className={kiosk ? undefined : 'flex items-center gap-1 text-base font-bold uppercase tracking-wide'}
         style={kiosk ? { fontSize: '1.4rem', fontWeight: 800, textTransform: 'uppercase', margin: 0 } : undefined}>
        <Ban size={kiosk ? 20 : 16} aria-hidden /> Do not admit
      </p>
      <p className={kiosk ? undefined : 'mt-1 text-sm font-semibold'} style={kiosk ? { fontSize: '1.15rem', fontWeight: 700, margin: '0.25rem 0 0' } : undefined}>
        {refusal.attendeeName} — {refusal.reason}
      </p>
      <p className={kiosk ? undefined : 'mt-0.5 text-sm'} style={kiosk ? { fontSize: '1rem', margin: '0.25rem 0 0' } : undefined}>
        {refusal.guidance}
      </p>
    </div>
  )
}

'use client'

// O135: a refusal stays on screen until staff move on deliberately.
export function NextGuestButton({ onClick, variant = 'toast' }: { onClick: () => void; variant?: 'toast' | 'kiosk' }) {
  const kiosk = variant === 'kiosk'
  return (
    <button
      type="button"
      onClick={onClick}
      className={kiosk ? undefined : 'w-full py-3 rounded-xl text-sm font-semibold'}
      style={kiosk
        ? { width: '100%', maxWidth: 560, marginBottom: '1rem', padding: '0.875rem', borderRadius: 12, fontSize: '1.1rem', fontWeight: 700, background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', cursor: 'pointer' }
        : { background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', cursor: 'pointer' }}
    >
      Next guest
    </button>
  )
}

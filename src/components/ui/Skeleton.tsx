type SkeletonVariant = 'text' | 'card' | 'table-row' | 'stat'

interface SkeletonProps {
  variant?: SkeletonVariant
  className?: string
  lines?: number
}

const pulse = {
  background: 'var(--pz-surface-2)',
  borderRadius: 4,
  animation: 'pulse 1.5s ease-in-out infinite',
} as const

export function Skeleton({ variant = 'text', lines = 3, className }: SkeletonProps) {
  if (variant === 'stat') {
    return (
      <div
        className={`rounded-xl p-4 ${className ?? ''}`}
        style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)' }}
      >
        <div style={{ ...pulse, height: 12, width: '60%', marginBottom: 12 }} />
        <div style={{ ...pulse, height: 32, width: '80%' }} />
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div
        className={`rounded-xl p-5 ${className ?? ''}`}
        style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)' }}
      >
        <div style={{ ...pulse, height: 14, width: '40%', marginBottom: 16 }} />
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} style={{ ...pulse, height: 12, width: i === lines - 1 ? '60%' : '100%', marginBottom: 10 }} />
        ))}
      </div>
    )
  }

  if (variant === 'table-row') {
    return (
      <tr>
        {Array.from({ length: lines }).map((_, i) => (
          <td key={i} className="px-4 py-3">
            <div style={{ ...pulse, height: 12, width: i === 0 ? '80%' : '60%' }} />
          </td>
        ))}
      </tr>
    )
  }

  return (
    <div className={className}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ ...pulse, height: 12, width: i === lines - 1 ? '70%' : '100%', marginBottom: 10 }} />
      ))}
    </div>
  )
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant="card" lines={2} />
      ))}
    </div>
  )
}

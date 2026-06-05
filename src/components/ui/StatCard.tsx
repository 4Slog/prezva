interface StatDelta {
  value: string
  direction: 'up' | 'down' | 'flat'
}

interface StatCardProps {
  label: string
  value: string | number
  delta?: StatDelta
  hint?: string
}

const DELTA_ARROW: Record<StatDelta['direction'], string> = {
  up:   '↑',
  down: '↓',
  flat: '→',
}

const DELTA_COLOR: Record<StatDelta['direction'], string> = {
  up:   'var(--pz-success)',
  down: 'var(--pz-error)',
  flat: 'var(--pz-muted)',
}

const DELTA_LABEL: Record<StatDelta['direction'], string> = {
  up:   'up',
  down: 'down',
  flat: 'no change',
}

export function StatCard({ label, value, delta, hint }: StatCardProps) {
  return (
    <div
      className="pz-card flex flex-col gap-1 p-4"
    >
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--pz-label)' }}>
        {label}
      </p>
      <p className="text-2xl font-semibold" style={{ color: 'var(--pz-text)' }}>
        {value}
      </p>
      {delta && (
        <p
          className="text-xs font-medium"
          style={{ color: DELTA_COLOR[delta.direction] }}
          aria-label={`${DELTA_LABEL[delta.direction]} ${delta.value}`}
        >
          <span aria-hidden>{DELTA_ARROW[delta.direction]} </span>
          {delta.value}
        </p>
      )}
      {hint && (
        <p className="text-xs mt-1" style={{ color: 'var(--pz-muted)' }}>{hint}</p>
      )}
    </div>
  )
}

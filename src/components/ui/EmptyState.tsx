import Link from 'next/link'

interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  actionLabel?: string
  actionHref?: string
}

export function EmptyState({ icon, title, description, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="mb-4 text-5xl opacity-40">{icon}</div>
      )}
      <p className="text-lg font-semibold" style={{ color: 'var(--pz-text)' }}>{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm" style={{ color: 'var(--pz-muted)' }}>{description}</p>
      )}
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-6 inline-block rounded-lg px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          {actionLabel}
        </Link>
      )}
    </div>
  )
}

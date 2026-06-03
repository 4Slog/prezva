interface PageHeaderProps {
  title: string
  subtitle?: string
  status?: React.ReactNode
  actions?: React.ReactNode
}

export function PageHeader({ title, subtitle, status, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--pz-text)' }}>
            {title}
          </h1>
          {status && <div className="flex flex-wrap items-center gap-1.5">{status}</div>}
        </div>
        {subtitle && (
          <p className="mt-0.5 text-sm" style={{ color: 'var(--pz-muted)' }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  )
}

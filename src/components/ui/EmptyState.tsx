'use client'

import Link from 'next/link'

interface EmptyStateAction {
  label: string
  href?: string
  onClick?: () => void
}

interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: EmptyStateAction
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 2rem',
        background: 'var(--pz-surface)',
        border: '1px solid var(--pz-border)',
        borderRadius: 12,
        textAlign: 'center',
      }}
    >
      {icon && (
        <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.5 }}>{icon}</div>
      )}
      <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--pz-text)', marginBottom: description ? 8 : 0 }}>
        {title}
      </p>
      {description && (
        <p style={{ fontSize: 14, color: 'var(--pz-muted)', maxWidth: 400, lineHeight: 1.5 }}>
          {description}
        </p>
      )}
      {action && (
        <div style={{ marginTop: 20 }}>
          {action.href ? (
            <Link
              href={action.href}
              style={{
                display: 'inline-block',
                background: 'var(--pz-teal)',
                color: '#0D1B2A',
                fontWeight: 600,
                fontSize: 14,
                padding: '8px 20px',
                borderRadius: 8,
                textDecoration: 'none',
              }}
            >
              {action.label}
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              style={{
                background: 'var(--pz-teal)',
                color: '#0D1B2A',
                fontWeight: 600,
                fontSize: 14,
                padding: '8px 20px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

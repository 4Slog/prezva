'use client'

import Link from 'next/link'
import { Button } from './Button'

interface EmptyStateAction {
  label: string
  href?: string
  onClick?: () => void
}

interface EmptyStateProps {
  icon?: string | React.ReactNode
  title: string
  description?: string
  body?: string
  action?: EmptyStateAction
}

export function EmptyState({ icon, title, description, body, action }: EmptyStateProps) {
  const text = description ?? body

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
        <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.6, color: 'var(--pz-muted)' }}>
          {icon}
        </div>
      )}
      <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--pz-text)', marginBottom: text ? 8 : 0 }}>
        {title}
      </p>
      {text && (
        <p style={{ fontSize: 14, color: 'var(--pz-muted)', maxWidth: 400, lineHeight: 1.5 }}>
          {text}
        </p>
      )}
      {action && (
        <div style={{ marginTop: 20 }}>
          {action.href ? (
            <Link href={action.href}>
              <Button>{action.label}</Button>
            </Link>
          ) : (
            <Button onClick={action.onClick}>{action.label}</Button>
          )}
        </div>
      )}
    </div>
  )
}

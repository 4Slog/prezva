'use client'

import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'

interface Trail {
  label: string
  href?: string
}

interface PageNavProps {
  home: string
  trail: Trail[]
}

function resolveParent(trail: Trail[], home: string): string {
  for (let i = trail.length - 2; i >= 0; i--) {
    if (trail[i].href) return trail[i].href as string
  }
  return home
}

export function PageNav({ home, trail }: PageNavProps) {
  const showBack = trail.length > 0
  const parentHref = resolveParent(trail, home)

  return (
    <nav aria-label="Page navigation" className="flex flex-wrap items-center gap-2 mb-4 text-sm">
      {showBack && (
        <Link
          href={parentHref}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors hover:opacity-80"
          style={{
            color: 'var(--pz-muted)',
            background: 'var(--pz-surface-2)',
            border: '1px solid var(--pz-border)',
          }}
        >
          ← Back
        </Link>
      )}

      <Link
        href={home}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:opacity-80"
        aria-label="Home"
        style={{ color: 'var(--pz-muted)' }}
      >
        <Home size={14} aria-hidden />
        <span>Home</span>
      </Link>

      {trail.map((crumb, i) => {
        const isLast = i === trail.length - 1
        return (
          <span key={i} className="flex items-center gap-2">
            <ChevronRight size={12} aria-hidden style={{ color: 'var(--pz-label)' }} />
            {isLast || !crumb.href ? (
              <span
                aria-current={isLast ? 'page' : undefined}
                style={{ color: isLast ? 'var(--pz-text)' : 'var(--pz-muted)', fontWeight: isLast ? 500 : 400 }}
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="hover:underline"
                style={{ color: 'var(--pz-muted)' }}
              >
                {crumb.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}

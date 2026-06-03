'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'

interface Trail {
  label: string
  href?: string
}

interface PageNavProps {
  home: string
  trail: Trail[]
  /** When set, PageNav reads the current pathname and appends the sub-segment after basePath as a dynamic section crumb. */
  basePath?: string
}

function resolveParent(trail: Trail[], home: string): string {
  for (let i = trail.length - 2; i >= 0; i--) {
    if (trail[i].href) return trail[i].href as string
  }
  return home
}

function toSectionLabel(segment: string): string {
  return segment.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function PageNav({ home, trail, basePath }: PageNavProps) {
  const pathname = usePathname()
  const showBack = trail.length > 0
  const parentHref = resolveParent(trail, home)

  // Derive the current section label from the pathname when basePath is set.
  let sectionLabel: string | null = null
  if (basePath && pathname !== basePath && pathname.startsWith(basePath + '/')) {
    const segment = pathname.slice(basePath.length + 1).split('/')[0]
    if (segment) sectionLabel = toSectionLabel(segment)
  }

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
        const isStaticLast = i === trail.length - 1
        // When a dynamic section will follow, the last static crumb is a link, not the current page.
        const isCurrentPage = isStaticLast && !sectionLabel
        return (
          <span key={i} className="flex items-center gap-2">
            <ChevronRight size={12} aria-hidden style={{ color: 'var(--pz-label)' }} />
            {isCurrentPage || !crumb.href ? (
              <span
                aria-current={isCurrentPage ? 'page' : undefined}
                style={{ color: isCurrentPage ? 'var(--pz-text)' : 'var(--pz-muted)', fontWeight: isCurrentPage ? 500 : 400 }}
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

      {sectionLabel && (
        <span className="flex items-center gap-2">
          <ChevronRight size={12} aria-hidden style={{ color: 'var(--pz-label)' }} />
          <span aria-current="page" style={{ color: 'var(--pz-text)', fontWeight: 500 }}>
            {sectionLabel}
          </span>
        </span>
      )}
    </nav>
  )
}

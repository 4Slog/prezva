'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ADMIN_TILES, TILE_CATEGORIES } from '@/lib/events/admin-tiles'

interface Props {
  eventSlug: string
  eventTitle: string
  orgSlug?: string
}

export function EventSidebar({ eventSlug, eventTitle, orgSlug }: Props) {
  const pathname = usePathname()

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside style={{ width: 200, flexShrink: 0, background: 'var(--pz-chrome-elevated)', borderRight: '1px solid var(--pz-chrome-line)', overflowY: 'auto', padding: '1rem 0' }}>
      <div style={{ padding: '0 12px 8px' }}>
        <Link
          href={`/events/${eventSlug}`}
          style={{ fontSize: 11, fontWeight: 700, color: 'var(--pz-teal)', textDecoration: 'none', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}
        >
          ← Back to event
        </Link>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--pz-chrome-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {eventTitle}
        </p>
      </div>

      {TILE_CATEGORIES.map(({ key: cat, label: catLabel }) => {
        const tiles = ADMIN_TILES.filter(t => t.category === cat)
        return (
          <div key={cat} style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--pz-chrome-muted)', textTransform: 'uppercase', letterSpacing: 0.8, padding: '4px 16px 2px' }}>
              {catLabel}
            </p>
            {tiles.map(tile => {
              const href = tile.key === 'integrations' && orgSlug
                ? `/orgs/${orgSlug}/integrations`
                : tile.href(eventSlug)
              const active = isActive(href)
              return (
                <Link
                  key={tile.key}
                  href={href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 16px',
                    fontSize: 12,
                    fontWeight: active ? 600 : 400,
                    color: active ? 'var(--pz-teal)' : 'var(--pz-chrome-text)',
                    textDecoration: 'none',
                    background: active ? 'var(--pz-chrome-active)' : 'transparent',
                    borderLeft: active ? '2px solid var(--pz-teal)' : '2px solid transparent',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{tile.icon}</span>
                  {tile.label}
                </Link>
              )
            })}
          </div>
        )
      })}
    </aside>
  )
}

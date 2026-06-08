import Link from 'next/link'
import { ADMIN_TILES, TILE_CATEGORIES } from '@/lib/events/admin-tiles'
import type { TileBadge } from '@/lib/events/admin-tile-counts'
import type { LucideIcon } from 'lucide-react'

interface Props {
  eventSlug: string
  orgSlug?: string
  badges?: Record<string, TileBadge>
  expandAll?: boolean
  permissions: string[]
}

export function AdminTileGrid({ eventSlug, orgSlug, badges = {}, expandAll = false, permissions }: Props) {
  const permSet = new Set(permissions)
  const allowed = (key: string) => permSet.has('*') || permSet.has(key)

  return (
    <div>
      {TILE_CATEGORIES.map(({ key: cat, label: catLabel }) => {
        const tiles = ADMIN_TILES.filter(t => t.category === cat && allowed(t.permission))
        if (tiles.length === 0) return null
        const isPrimary = cat === 'people'

        return (
          <details key={cat} open={isPrimary || cat === 'program' || cat === 'community' || cat === 'communications' || cat === 'sponsors' || cat === 'admin' || expandAll} style={{ marginBottom: 24 }}>
            <summary style={{
              cursor: isPrimary ? 'default' : 'pointer',
              listStyle: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
              userSelect: 'none',
            }}>
              {!isPrimary && <span style={{ fontSize: 11, color: 'var(--pz-muted)' }}>▶</span>}
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {catLabel}
              </span>
              <span style={{ fontSize: 11, color: 'var(--pz-muted)' }}>{tiles.length}</span>
            </summary>

            <div style={{ display: 'grid', gridTemplateColumns: isPrimary ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {tiles.map(tile => {
                const badge = badges[tile.key]
                const href = tile.key === 'integrations' && orgSlug
                  ? `/orgs/${orgSlug}/integrations`
                  : tile.href(eventSlug)

                const TileIcon = tile.icon as LucideIcon
                return (
                  <Link
                    key={tile.key}
                    href={href}
                    style={{
                      display: 'block',
                      background: 'var(--pz-surface)',
                      border: '1px solid var(--pz-border)',
                      borderRadius: 10,
                      padding: '1rem',
                      textDecoration: 'none',
                      transition: 'border-color 0.15s',
                      position: 'relative',
                    }}
                    className="hover:border-[var(--pz-teal)] transition-colors group"
                  >
                    {badge && (
                      <span style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: badge.variant === 'error' ? 'var(--pz-error-bg)' : badge.variant === 'warning' ? 'var(--pz-warning-bg)' : 'var(--pz-teal-bg)',
                        color: badge.variant === 'error' ? 'var(--pz-error)' : badge.variant === 'warning' ? 'var(--pz-warning)' : 'var(--pz-teal-ink)',
                      }}>
                        {badge.label}
                      </span>
                    )}
                    <div style={{ marginBottom: 8 }}>
                      <TileIcon size={20} style={{ color: 'var(--pz-muted)' }} />
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 3 }}>{tile.label}</p>
                    <p style={{ fontSize: 11, color: 'var(--pz-muted)', lineHeight: 1.4 }}>{tile.description}</p>
                  </Link>
                )
              })}
            </div>
          </details>
        )
      })}
    </div>
  )
}

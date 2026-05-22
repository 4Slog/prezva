import Link from 'next/link'
import { ADMIN_TILES, TILE_CATEGORIES, type TileCategory } from '@/lib/events/admin-tiles'
import type { TileBadge } from '@/lib/events/admin-tile-counts'

const ROLE_LEVEL: Record<string, number> = { staff: 1, admin: 2, owner: 3 }

interface Props {
  eventSlug: string
  orgSlug?: string
  badges?: Record<string, TileBadge>
  expandAll?: boolean
  userRole?: string | null
}

export function AdminTileGrid({ eventSlug, orgSlug, badges = {}, expandAll = false, userRole }: Props) {
  const userLevel = ROLE_LEVEL[userRole ?? ''] ?? 0
  return (
    <div>
      {TILE_CATEGORIES.map(({ key: cat, label: catLabel }) => {
        const tiles = ADMIN_TILES.filter(t => {
          if (t.category !== cat) return false
          if (!t.min_role) return true
          return userLevel >= (ROLE_LEVEL[t.min_role] ?? 0)
        })
        const isCore = cat === 'core'

        return (
          <details key={cat} open={isCore || cat === 'engagement' || expandAll} style={{ marginBottom: 24 }}>
            <summary style={{
              cursor: isCore ? 'default' : 'pointer',
              listStyle: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
              userSelect: 'none',
            }}>
              {!isCore && <span style={{ fontSize: 11, color: 'var(--pz-muted)' }}>▶</span>}
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {catLabel}
              </span>
              <span style={{ fontSize: 11, color: 'var(--pz-muted)' }}>{tiles.length}</span>
            </summary>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {tiles.map(tile => {
                const badge = badges[tile.key]
                const href = tile.key === 'integrations' && orgSlug
                  ? `/orgs/${orgSlug}/integrations`
                  : tile.href(eventSlug)

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
                        background: badge.variant === 'error' ? '#ef444422' : badge.variant === 'warning' ? '#f59e0b22' : 'var(--pz-teal)22',
                        color: badge.variant === 'error' ? '#ef4444' : badge.variant === 'warning' ? '#f59e0b' : 'var(--pz-teal)',
                      }}>
                        {badge.label}
                      </span>
                    )}
                    <div style={{ fontSize: 22, marginBottom: 8 }}>{tile.icon}</div>
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

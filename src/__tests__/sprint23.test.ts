import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { ADMIN_TILES, TILE_CATEGORIES, getTilesByCategory } from '../lib/events/admin-tiles'

const SRC = join(process.cwd(), 'src')

describe('Sprint 23 — Module Tile Gap Closure', () => {
  // Tile registry
  it('ADMIN_TILES has 19+ entries covering all categories', () => {
    expect(ADMIN_TILES.length).toBeGreaterThanOrEqual(19)
  })

  it('all four categories are represented', () => {
    const cats = new Set(ADMIN_TILES.map(t => t.category))
    expect(cats.has('core')).toBe(true)
    expect(cats.has('engagement')).toBe(true)
    expect(cats.has('advanced')).toBe(true)
    expect(cats.has('integration')).toBe(true)
  })

  it('core tiles include attendees, tickets, agenda, speakers, checkin, badges', () => {
    const coreKeys = getTilesByCategory('core').map(t => t.key)
    expect(coreKeys).toContain('attendees')
    expect(coreKeys).toContain('tickets')
    expect(coreKeys).toContain('agenda')
    expect(coreKeys).toContain('speakers')
    expect(coreKeys).toContain('checkin')
    expect(coreKeys).toContain('badges')
  })

  it('engagement tiles include announcements, surveys, networking, community, photos, leaderboard, icebreakers, trivia', () => {
    const keys = getTilesByCategory('engagement').map(t => t.key)
    ;['announcements', 'surveys', 'networking', 'community', 'photos', 'leaderboard', 'icebreakers', 'trivia'].forEach(k => {
      expect(keys).toContain(k)
    })
  })

  it('advanced tiles include sponsors, certificates, analytics, audit-log', () => {
    const keys = getTilesByCategory('advanced').map(t => t.key)
    ;['sponsors', 'certificates', 'analytics', 'audit-log'].forEach(k => {
      expect(keys).toContain(k)
    })
  })

  it('all tiles have required fields', () => {
    ADMIN_TILES.forEach(tile => {
      expect(tile.key).toBeTruthy()
      expect(tile.label).toBeTruthy()
      expect(tile.icon).toBeTruthy()
      expect(tile.description).toBeTruthy()
      expect(typeof tile.href).toBe('function')
      // integrations tile links to org route, not event route
      if (tile.key !== 'integrations') {
        expect(tile.href('test-event')).toContain('test-event')
      }
    })
  })

  it('TILE_CATEGORIES has 4 entries', () => {
    expect(TILE_CATEGORIES.length).toBe(4)
  })

  // AdminTileGrid component
  it('AdminTileGrid component exists', () => {
    const path = join(SRC, 'components/events/AdminTileGrid.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('ADMIN_TILES')
    expect(src).toContain('TILE_CATEGORIES')
    expect(src).toContain('TileBadge')
  })

  // EventSidebar component
  it('EventSidebar component exists', () => {
    const path = join(SRC, 'components/events/EventSidebar.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain("'use client'")
    expect(src).toContain('usePathname')
    expect(src).toContain('ADMIN_TILES')
  })

  // Event admin landing uses tile grid
  it('event admin landing uses AdminTileGrid', () => {
    const path = join(SRC, 'app/(dashboard)/events/[slug]/page.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('AdminTileGrid')
    expect(src).toContain('getAdminTileBadges')
  })

  // Admin tile counts
  it('admin-tile-counts exports getAdminTileBadges', () => {
    const path = join(SRC, 'lib/events/admin-tile-counts.ts')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('getAdminTileBadges')
    expect(src).toContain('Promise.allSettled')
  })

  // Dashboard layout sidebar
  it('dashboard layout sidebar has expanded nav items', () => {
    const path = join(SRC, 'app/(dashboard)/layout.tsx')
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('Integrations')
    expect(src).toContain('Templates')
    expect(src).toContain('Audit Log')
    expect(src).toContain('Help')
  })

  // Missing admin pages created
  it('event photos admin page exists', () => {
    expect(existsSync(join(SRC, 'app/(dashboard)/events/[slug]/photos/page.tsx'))).toBe(true)
  })

  it('event leaderboard admin page exists', () => {
    expect(existsSync(join(SRC, 'app/(dashboard)/events/[slug]/leaderboard/page.tsx'))).toBe(true)
  })

  it('event sponsors admin page exists', () => {
    expect(existsSync(join(SRC, 'app/(dashboard)/events/[slug]/sponsors/page.tsx'))).toBe(true)
  })

  it('event audit-log admin page exists', () => {
    expect(existsSync(join(SRC, 'app/(dashboard)/events/[slug]/audit-log/page.tsx'))).toBe(true)
    const src = readFileSync(join(SRC, 'app/(dashboard)/events/[slug]/audit-log/page.tsx'), 'utf-8')
    expect(src).toContain('audit_logs')
  })

  it('org audit-log page exists', () => {
    expect(existsSync(join(SRC, 'app/(dashboard)/orgs/[slug]/audit-log/page.tsx'))).toBe(true)
    const src = readFileSync(join(SRC, 'app/(dashboard)/orgs/[slug]/audit-log/page.tsx'), 'utf-8')
    expect(src).toContain('audit_logs')
    expect(src).toContain('org_id')
  })
})

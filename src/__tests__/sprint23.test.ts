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

  it('all six categories are represented', () => {
    const cats = new Set(ADMIN_TILES.map(t => t.category))
    expect(cats.has('people')).toBe(true)
    expect(cats.has('program')).toBe(true)
    expect(cats.has('community')).toBe(true)
    expect(cats.has('communications')).toBe(true)
    expect(cats.has('sponsors')).toBe(true)
    expect(cats.has('admin')).toBe(true)
  })

  it('people tiles include attendees, checkin, tickets, badges, certificates, volunteers', () => {
    const keys = getTilesByCategory('people').map(t => t.key)
    ;['attendees', 'checkin', 'tickets', 'badges', 'certificates', 'volunteers'].forEach(k => {
      expect(keys).toContain(k)
    })
  })

  it('program tiles include agenda, speakers, run-of-show', () => {
    const keys = getTilesByCategory('program').map(t => t.key)
    ;['agenda', 'speakers', 'run-of-show'].forEach(k => {
      expect(keys).toContain(k)
    })
  })

  it('community tiles include networking, community, photos, leaderboard, icebreakers, trivia, passport', () => {
    const keys = getTilesByCategory('community').map(t => t.key)
    ;['networking', 'community', 'photos', 'leaderboard', 'icebreakers', 'trivia', 'passport'].forEach(k => {
      expect(keys).toContain(k)
    })
  })

  it('communications tiles include announcements, surveys', () => {
    const keys = getTilesByCategory('communications').map(t => t.key)
    ;['announcements', 'surveys'].forEach(k => {
      expect(keys).toContain(k)
    })
  })

  it('admin tiles include analytics, audit-log, dead-letters, integrations', () => {
    const keys = getTilesByCategory('admin').map(t => t.key)
    ;['analytics', 'audit-log', 'dead-letters', 'integrations'].forEach(k => {
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

  it('TILE_CATEGORIES has 6 entries', () => {
    expect(TILE_CATEGORIES.length).toBe(6)
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

import { describe, it, expect, vi } from 'vitest'
import { isEventGhlLinked } from './location'

function makeAdmin(cfg: { event: { org_id: string } | null; locationRow: { ghl_location_id: string } | null }) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'events') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: cfg.event, error: null }),
        }
      }
      if (table === 'ghl_location_links') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue(
            cfg.locationRow
              ? { data: cfg.locationRow, error: null }
              : { data: null, error: { code: 'PGRST116', message: 'no rows' } },
          ),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    }),
  }
}

describe('isEventGhlLinked', () => {
  it('linked: true with orgId + locationId when a ghl_location_links row exists', async () => {
    const admin = makeAdmin({ event: { org_id: 'org-1' }, locationRow: { ghl_location_id: 'loc-1' } })

    const result = await isEventGhlLinked(admin as any, 'event-1')

    expect(result).toEqual({ linked: true, orgId: 'org-1', locationId: 'loc-1' })
  })

  it('linked: false + locationId null when no ghl_location_links row exists for the org', async () => {
    const admin = makeAdmin({ event: { org_id: 'org-1' }, locationRow: null })

    const result = await isEventGhlLinked(admin as any, 'event-1')

    expect(result).toEqual({ linked: false, orgId: 'org-1', locationId: null })
  })

  it('linked: false + orgId null when the event row has no org_id', async () => {
    const admin = makeAdmin({ event: null, locationRow: null })

    const result = await isEventGhlLinked(admin as any, 'event-missing')

    expect(result).toEqual({ linked: false, orgId: null, locationId: null })
  })
})

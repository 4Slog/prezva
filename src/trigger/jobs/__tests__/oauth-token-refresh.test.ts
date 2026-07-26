import { describe, it, expect, vi } from 'vitest'
import { makeFakeAdmin, type Recorded } from './fake-supabase'

vi.mock('@trigger.dev/sdk/v3', () => ({
  schedules: { task: (opts: any) => opts },
}))

import { findExpiringIntegrations } from '../oauth-token-refresh'

type Row = { id: string; org_id: string; provider: string; status: string; token_expires_at: string }

function buildResolver(rows: Row[]) {
  return (call: Recorded) => {
    if (call.table !== 'org_integrations') throw new Error(`unexpected table: ${call.table}`)
    const statuses: string[] = call.filters.status?.in ?? []
    const expiringBefore: string = call.filters.token_expires_at?.lte
    const expiredAfter: string = call.filters.token_expires_at?.gte
    const matches = rows.filter(
      (r) =>
        statuses.includes(r.status) &&
        r.token_expires_at <= expiringBefore &&
        r.token_expires_at >= expiredAfter,
    )
    return { data: matches, error: null }
  }
}

const TEN_MIN_FROM_NOW = '2026-07-26T00:10:00.000Z'
const SEVEN_DAYS_AGO = '2026-07-19T00:00:00.000Z'

describe('findExpiringIntegrations', () => {
  it('includes an integration in error state expiring within the window', async () => {
    const rows: Row[] = [
      { id: 'i1', org_id: 'org-1', provider: 'ghl', status: 'error', token_expires_at: '2026-07-26T00:05:00.000Z' },
    ]
    const { admin } = makeFakeAdmin(buildResolver(rows))
    const result = await findExpiringIntegrations(admin as any, TEN_MIN_FROM_NOW, SEVEN_DAYS_AGO)
    expect(result.map((r) => r.id)).toEqual(['i1'])
  })

  it('excludes an integration in error state whose token expired more than seven days ago', async () => {
    const rows: Row[] = [
      { id: 'i2', org_id: 'org-2', provider: 'ghl', status: 'error', token_expires_at: '2026-07-10T00:00:00.000Z' },
    ]
    const { admin } = makeFakeAdmin(buildResolver(rows))
    const result = await findExpiringIntegrations(admin as any, TEN_MIN_FROM_NOW, SEVEN_DAYS_AGO)
    expect(result).toEqual([])
  })
})

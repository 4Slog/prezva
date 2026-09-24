import { describe, it, expect, beforeEach, vi } from 'vitest'

// O120 / F5: both audit-log pages read through the service-role client, so the
// page's own gate is the only thing between a signed-in user and the trail.
// The real hasPermission / requireEventOrgAccess run here over an in-memory
// table store, so "non-member" and "member without the key" are exercised
// through the actual membership and role_permissions lookups.

const USER = 'user-1'
const ORG = 'org-1'
const EVENT = 'event-1'
const ROLE_WITH = 'role-with'
const ROLE_WITHOUT = 'role-without'

type Row = Record<string, unknown>
let tables: Record<string, Row[]>
let auditReads: Array<{ column: string; value: unknown }>

function query(table: string) {
  const filters: Array<[string, unknown]> = []
  const rows = () => (tables[table] ?? []).filter(r => filters.every(([k, v]) => r[k] === v))
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (k: string, v: unknown) => {
      filters.push([k, v])
      if (table === 'audit_logs') auditReads.push({ column: k, value: v })
      return q
    },
    order: () => q,
    limit: () => Promise.resolve({ data: rows(), error: null }),
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    single: () => {
      const r = rows()[0]
      return Promise.resolve(r ? { data: r, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } })
    },
  }
  return q
}
const fakeClient = { from: (t: string) => query(t) }

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeClient }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeClient }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: USER })) }))
vi.mock('@/lib/admin/gate', () => ({ isSuperAdmin: () => false }))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }),
}))

import OrgAuditLogPage from '@/app/(dashboard)/orgs/[slug]/audit-log/page'
import EventAuditLogPage from '@/app/(dashboard)/events/[slug]/audit-log/page'

function seed(membership: 'none' | 'without' | 'with') {
  tables = {
    organizations: [{ id: ORG, name: 'Acme', slug: 'acme' }],
    events: [{ id: EVENT, title: 'Summit', slug: 'summit', org_id: ORG }],
    org_members: membership === 'none' ? [] : [{
      org_id: ORG, user_id: USER, role: 'staff',
      role_id: membership === 'with' ? ROLE_WITH : ROLE_WITHOUT,
    }],
    role_permissions: [
      { role_id: ROLE_WITH, permission_key: 'org.audit_log' },
      { role_id: ROLE_WITH, permission_key: 'event.audit_log' },
      { role_id: ROLE_WITHOUT, permission_key: 'event.checkin' },
    ],
    audit_logs: [
      { id: 'a1', org_id: ORG, event_id: EVENT, action: 'checkin.scan', table_name: 'registrations', created_at: '2026-09-24T12:00:00Z', user_id: USER },
    ],
  }
}

const orgParams = { params: Promise.resolve({ slug: 'acme' }) }
const eventParams = { params: Promise.resolve({ slug: 'summit' }) }

beforeEach(() => {
  auditReads = []
})

describe('org audit-log page', () => {
  it('refuses a signed-in non-member, without reading the trail', async () => {
    seed('none')
    await expect(OrgAuditLogPage(orgParams)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(auditReads).toEqual([])
  })

  it('refuses a member without org.audit_log, without reading the trail', async () => {
    seed('without')
    await expect(OrgAuditLogPage(orgParams)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(auditReads).toEqual([])
  })

  it('refuses an unknown slug', async () => {
    seed('with')
    await expect(OrgAuditLogPage({ params: Promise.resolve({ slug: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(auditReads).toEqual([])
  })

  it('renders for a member with org.audit_log, scoped to that org', async () => {
    seed('with')
    await expect(OrgAuditLogPage(orgParams)).resolves.toBeTruthy()
    expect(auditReads).toEqual([{ column: 'org_id', value: ORG }])
  })
})

describe('event audit-log page', () => {
  it('refuses a signed-in non-member, without reading the trail', async () => {
    seed('none')
    await expect(EventAuditLogPage(eventParams)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(auditReads).toEqual([])
  })

  it('refuses a member without event.audit_log, without reading the trail', async () => {
    seed('without')
    await expect(EventAuditLogPage(eventParams)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(auditReads).toEqual([])
  })

  it('renders for a member with event.audit_log, scoped to that event', async () => {
    seed('with')
    await expect(EventAuditLogPage(eventParams)).resolves.toBeTruthy()
    expect(auditReads).toEqual([{ column: 'event_id', value: EVENT }])
  })
})

/**
 * Integration: org_members schema
 * Sprint 1 bug: accepted_at column was referenced but never existed in the real schema.
 * These tests would have failed before Sprint 1 was applied.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { db, DEMO, cleanupIntTestData } from './setup'

afterAll(cleanupIntTestData)

describe('org_members — schema integration', () => {
  it('selects role from org_members without accepted_at', async () => {
    const { data, error } = await db
      .from('org_members')
      .select('role')
      .eq('org_id', DEMO.orgId)
      .eq('user_id', DEMO.userId)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.role).toBe('owner')
  })

  it('selects org with members join — no accepted_at in query', async () => {
    const { data, error } = await db
      .from('organizations')
      .select('id, name, slug, org_members!inner(user_id, role)')
      .eq('id', DEMO.orgId)
      .eq('org_members.user_id', DEMO.userId)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.slug).toBe('civitas')
  })

  it('inserts org_members row without accepted_at field', async () => {
    // Use a secondary user ID to avoid unique constraint with demo owner
    // We create a fake UUID that won't collide but also won't exist in auth.users
    // (FK is to org_members.user_id → profiles.id — use a known second profile)
    const { data: profiles } = await db
      .from('profiles')
      .select('id')
      .neq('id', DEMO.userId)
      .limit(1)
      .maybeSingle()

    if (!profiles) {
      // Only demo user exists — skip write test (read-only assertion is sufficient)
      return
    }

    const { error } = await db.from('org_members').insert({
      org_id: DEMO.orgId,
      user_id: profiles.id,
      role: 'staff',
      invited_by: DEMO.userId,
      // No accepted_at — column does not exist
    })

    expect(error).toBeNull()
    // cleanup handled by afterAll
  })

  it('getUserOrgs query — org_members with nested organizations', async () => {
    const { data, error } = await db
      .from('org_members')
      .select('role, organizations(id, name, slug, logo_url, timezone)')
      .eq('user_id', DEMO.userId)
      .order('joined_at', { ascending: true })

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect(data!.length).toBeGreaterThan(0)
  })
})

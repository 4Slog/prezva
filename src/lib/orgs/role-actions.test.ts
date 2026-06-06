import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/auth/get-user', () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 'actor-user' }),
}))

vi.mock('@/lib/auth/assert-permission', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/assert-permission')>()
  return { ...actual, assertPermission: vi.fn(), getOrgPermissions: vi.fn() }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

import { createRole, updateRolePermissions, deleteRole, assignMemberRole, renameRole } from './role-actions'
import { assertPermission, getOrgPermissions } from '@/lib/auth/assert-permission'
import { PermissionError } from '@/lib/auth/permission-error'
import { createAdminClient } from '@/lib/supabase/admin'

// Builds a thenable chain that resolves to `value`.
// `then` is configurable so tests can re-override per-call.
function makeChain(value: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'not', 'delete', 'update', 'insert']) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain['maybeSingle'] = vi.fn().mockResolvedValue(value)
  chain['single'] = vi.fn().mockResolvedValue(value)
  Object.defineProperty(chain, 'then', {
    configurable: true,
    enumerable: false,
    get() {
      return (resolve: (v: unknown) => unknown) => Promise.resolve(value).then(resolve)
    },
  })
  return chain
}

const ORG_ID = 'org-111'
const ROLE_ID = 'role-custom-1'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(assertPermission).mockResolvedValue(undefined)
})

// ── G2: owner role permissions are frozen ────────────────────────────────────

describe('updateRolePermissions — G2 (owner frozen)', () => {
  it('rejects when target role is owner', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) =>
        table === 'roles'
          ? makeChain({ data: { org_id: ORG_ID, slug: 'owner' }, error: null })
          : makeChain({ data: null, error: null }),
    } as unknown as ReturnType<typeof createAdminClient>)

    const result = await updateRolePermissions(ROLE_ID, ['agenda.manage'])
    expect(result).toEqual({ error: 'The owner role permissions cannot be modified.' })
  })
})

// ── G1: escalation guard — can't grant what you don't hold ───────────────────

describe('updateRolePermissions — G1 (escalation guard)', () => {
  it('rejects when actor tries to grant org.billing (a permission they lack)', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) =>
        table === 'roles'
          ? makeChain({ data: { org_id: ORG_ID, slug: 'admin' }, error: null })
          : makeChain({ data: [], error: null }),
    } as unknown as ReturnType<typeof createAdminClient>)
    vi.mocked(getOrgPermissions).mockResolvedValue(
      new Set(['agenda.manage', 'org.roles.manage', 'org.settings']),
    )

    const result = await updateRolePermissions(ROLE_ID, ['agenda.manage', 'org.billing'])
    expect(result).toEqual({ error: "You can't grant a permission you don't have: org.billing" })
  })

  it('allows granting permissions the actor holds', async () => {
    // role_permissions select returns empty array (no current perms)
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'roles')
          return makeChain({ data: { org_id: ORG_ID, slug: 'staff' }, error: null })
        // role_permissions select for current perms → empty array result
        return makeChain({ data: [], error: null })
      },
    } as unknown as ReturnType<typeof createAdminClient>)
    vi.mocked(getOrgPermissions).mockResolvedValue(new Set(['agenda.manage', 'org.roles.manage']))

    const result = await updateRolePermissions(ROLE_ID, ['agenda.manage'])
    expect(result).not.toHaveProperty('error', expect.stringContaining("can't grant"))
  })
})

// ── G2: deleteRole — built-in roles cannot be deleted ───────────────────────

describe('deleteRole — G2 (built-in guard)', () => {
  it('rejects deleting a built-in role', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) =>
        table === 'roles'
          ? makeChain({ data: { org_id: ORG_ID, is_builtin: true, name: 'Staff' }, error: null })
          : makeChain({ data: null, error: null }),
    } as unknown as ReturnType<typeof createAdminClient>)

    const result = await deleteRole('builtin-staff-id')
    expect(result).toEqual({ error: 'Built-in role "Staff" cannot be deleted.' })
  })
})

// ── G3: deleteRole — role must have no members ───────────────────────────────

describe('deleteRole — G3 (member guard)', () => {
  it('rejects deleting a role that still has members', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'roles')
          return makeChain({ data: { org_id: ORG_ID, is_builtin: false, name: 'Volunteer' }, error: null })
        // org_members count query
        return makeChain({ count: 3, error: null })
      },
    } as unknown as ReturnType<typeof createAdminClient>)

    const result = await deleteRole(ROLE_ID)
    expect(result).toEqual({ error: 'Reassign all 3 members before deleting this role.' })
  })
})

// ── G4: assignMemberRole — last owner guard ───────────────────────────────────

describe('assignMemberRole — G4 (last owner guard)', () => {
  it('rejects changing the role of the last owner', async () => {
    let orgMembersCall = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'org_members') {
          orgMembersCall++
          if (orgMembersCall === 1) {
            // First call: get target member's current role
            return makeChain({ data: { role_id: 'owner-role-id', roles: { slug: 'owner' } }, error: null })
          }
          // Second call: count owners → 1 (last owner)
          return makeChain({ count: 1, error: null })
        }
        return makeChain({ data: null, error: null })
      },
    } as unknown as ReturnType<typeof createAdminClient>)

    const result = await assignMemberRole(ORG_ID, 'owner-user-id', 'admin-role-id')
    expect(result).toEqual({
      error: 'An organization must have at least one owner. Transfer ownership before changing this role.',
    })
  })
})

// ── G5: permission gate ──────────────────────────────────────────────────────

describe('createRole — G5 (permission gate)', () => {
  it('rejects when actor lacks org.roles.manage', async () => {
    vi.mocked(assertPermission).mockRejectedValue(new PermissionError('org.roles.manage'))
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => makeChain({ data: null, error: null }),
    } as unknown as ReturnType<typeof createAdminClient>)

    const result = await createRole(ORG_ID, 'My Custom Role')
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain("don't have permission")
  })
})

// ── G2: renameRole blocks owner ───────────────────────────────────────────────

describe('renameRole — G2 (owner cannot be renamed)', () => {
  it('rejects renaming the owner role', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) =>
        table === 'roles'
          ? makeChain({ data: { org_id: ORG_ID, slug: 'owner' }, error: null })
          : makeChain({ data: null, error: null }),
    } as unknown as ReturnType<typeof createAdminClient>)

    const result = await renameRole('owner-role-id', 'Super Owner')
    expect(result).toEqual({ error: 'The owner role cannot be renamed.' })
  })
})

// ── Happy path: createRole ───────────────────────────────────────────────────

describe('createRole — happy path', () => {
  it('creates a custom role and returns role data', async () => {
    const inserted = { id: 'new-role-id', name: 'Volunteer', slug: 'volunteer' }
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => makeChain({ data: inserted, error: null }),
    } as unknown as ReturnType<typeof createAdminClient>)

    const result = await createRole(ORG_ID, 'Volunteer')
    expect(result).toEqual({ role: inserted })
  })

  it('rejects a name that collides with a built-in slug', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => makeChain({ data: null, error: null }),
    } as unknown as ReturnType<typeof createAdminClient>)

    const result = await createRole(ORG_ID, 'Admin')
    expect(result).toEqual({ error: '"Admin" conflicts with a built-in role name.' })
  })
})

// ── Happy path: deleteRole succeeds for custom role with no members ───────────

describe('deleteRole — happy path', () => {
  it('deletes a custom role that has no members', async () => {
    let rolesCall = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'roles') {
          rolesCall++
          if (rolesCall === 1)
            return makeChain({ data: { org_id: ORG_ID, is_builtin: false, name: 'Volunteer' }, error: null })
          return makeChain({ data: null, error: null })
        }
        // org_members count = 0
        return makeChain({ count: 0, error: null })
      },
    } as unknown as ReturnType<typeof createAdminClient>)

    const result = await deleteRole(ROLE_ID)
    expect(result).toEqual({ success: true })
  })
})

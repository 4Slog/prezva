import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/admin/gate', () => ({
  isSuperAdmin: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

import { assertPermission } from './assert-permission'
import { isSuperAdmin } from '@/lib/admin/gate'
import { createAdminClient } from '@/lib/supabase/admin'

function makeChain(result: { data: object | null; error: object | null }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
}

function makeClient({
  memberRow,
  permRow,
}: {
  memberRow: object | null
  permRow?: object | null
}) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'org_members')
        return makeChain({ data: memberRow, error: null })
      if (table === 'role_permissions')
        return makeChain({ data: permRow ?? null, error: null })
      return makeChain({ data: null, error: null })
    }),
  }
}

const ORG = 'org-1'
const USER = 'user-1'

describe('assertPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isSuperAdmin).mockReturnValue(false)
  })

  it('bypasses DB entirely for super-admin', async () => {
    vi.mocked(isSuperAdmin).mockReturnValue(true)
    await expect(assertPermission(ORG, USER, 'announcements.send')).resolves.toBeUndefined()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('resolves when member has the permission key', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeClient({
        memberRow: { role_id: 'role-staff', role: 'staff' },
        permRow: { permission_key: 'checkin.manage' },
      }) as unknown as ReturnType<typeof createAdminClient>,
    )
    await expect(assertPermission(ORG, USER, 'checkin.manage')).resolves.toBeUndefined()
  })

  it('throws PermissionError with friendly message when member lacks the permission key', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeClient({
        memberRow: { role_id: 'role-staff', role: 'staff' },
        permRow: null,
      }) as unknown as ReturnType<typeof createAdminClient>,
    )
    await expect(assertPermission(ORG, USER, 'announcements.send')).rejects.toThrow(
      "You don't have permission to send announcements.",
    )
  })

  it('throws OrgAccessError when user is not a member', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeClient({ memberRow: null }) as unknown as ReturnType<typeof createAdminClient>,
    )
    await expect(assertPermission(ORG, USER, 'checkin.manage')).rejects.toThrow(
      "You don't have access to this organization.",
    )
  })

  it('throws OrgAccessError when orgId is undefined (optional-chain call site)', async () => {
    await expect(
      assertPermission(undefined as unknown as string, USER, 'checkin.manage'),
    ).rejects.toThrow("You don't have access to this organization.")
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})

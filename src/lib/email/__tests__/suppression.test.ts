import { describe, it, expect, vi } from 'vitest'
import { getSuppressedEmailSet, isEmailSuppressed } from '../suppression'

function makeSupabase(data: any, error: any = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data, error }),
    }),
  } as any
}

describe('getSuppressedEmailSet', () => {
  it('returns a lowercased Set of suppressed emails', async () => {
    const supabase = makeSupabase([{ email: 'Foo@Example.com' }, { email: 'bar@example.com' }])
    const result = await getSuppressedEmailSet(supabase)
    expect(result).toEqual(new Set(['foo@example.com', 'bar@example.com']))
  })

  it('returns an empty Set on query error (fail open)', async () => {
    const supabase = makeSupabase(null, { message: 'db unavailable' })
    const result = await getSuppressedEmailSet(supabase)
    expect(result).toEqual(new Set())
  })
})

describe('isEmailSuppressed', () => {
  it('returns true for a suppressed address, case-insensitively', async () => {
    const supabase = makeSupabase([{ email: 'suppressed@example.com' }])
    expect(await isEmailSuppressed(supabase, 'Suppressed@Example.com')).toBe(true)
  })

  it('returns false for a non-suppressed address', async () => {
    const supabase = makeSupabase([{ email: 'suppressed@example.com' }])
    expect(await isEmailSuppressed(supabase, 'clean@example.com')).toBe(false)
  })
})

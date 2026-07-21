// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { claimSsoNonce, hashSsoPayload } from './sso-nonce'
import { createAdminClient } from '@/lib/supabase/admin'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

interface MockDb {
  from: ReturnType<typeof vi.fn>
  insertMock: ReturnType<typeof vi.fn>
  deleteMock: ReturnType<typeof vi.fn>
  ltMock: ReturnType<typeof vi.fn>
}

function makeMockDb(opts: { insertError?: { code?: string; message: string } | null; deleteError?: { message: string } | null } = {}): MockDb {
  const { insertError = null, deleteError = null } = opts
  const ltMock = vi.fn().mockResolvedValue({ error: deleteError })
  const deleteMock = vi.fn().mockReturnValue({ lt: ltMock })
  const insertMock = vi.fn().mockResolvedValue({ error: insertError })
  const from = vi.fn().mockReturnValue({ insert: insertMock, delete: deleteMock })
  return { from, insertMock, deleteMock, ltMock }
}

// Simulates the real Postgres unique-constraint behavior of the payload_hash
// primary key: the first insert of a given hash succeeds, any later insert of
// the SAME hash fails with 23505 — used to prove insert-first replay rejection
// without a live database.
function makeStatefulMockDb(): MockDb {
  const claimed = new Set<string>()
  const ltMock = vi.fn().mockResolvedValue({ error: null })
  const deleteMock = vi.fn().mockReturnValue({ lt: ltMock })
  const insertMock = vi.fn().mockImplementation(async ({ payload_hash }: { payload_hash: string }) => {
    if (claimed.has(payload_hash)) {
      return { error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
    }
    claimed.add(payload_hash)
    return { error: null }
  })
  const from = vi.fn().mockReturnValue({ insert: insertMock, delete: deleteMock })
  return { from, insertMock, deleteMock, ltMock }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('hashSsoPayload', () => {
  it('is deterministic for the same input', () => {
    expect(hashSsoPayload('abc')).toBe(hashSsoPayload('abc'))
  })

  it('differs for different inputs', () => {
    expect(hashSsoPayload('abc')).not.toBe(hashSsoPayload('xyz'))
  })
})

describe('claimSsoNonce', () => {
  it('claims successfully on first use and fires the TTL cleanup delete', async () => {
    const db = makeMockDb()
    vi.mocked(createAdminClient).mockReturnValue(db as any)

    const result = await claimSsoNonce('hash-1')

    expect(result).toEqual({ ok: true })
    expect(db.insertMock).toHaveBeenCalledWith({ payload_hash: 'hash-1' })
    expect(db.deleteMock).toHaveBeenCalled()
    expect(db.ltMock).toHaveBeenCalledWith('created_at', expect.any(String))
  })

  it('first use succeeds; the identical payload hash replayed a second time is rejected', async () => {
    const db = makeStatefulMockDb()
    vi.mocked(createAdminClient).mockReturnValue(db as any)

    const first = await claimSsoNonce('same-hash')
    expect(first).toEqual({ ok: true })

    const second = await claimSsoNonce('same-hash')
    expect(second).toEqual({ ok: false, reason: 'replay' })
  })

  it('does not fire cleanup when the claim is rejected as a replay', async () => {
    const db = makeMockDb({ insertError: { code: '23505', message: 'duplicate key' } })
    vi.mocked(createAdminClient).mockReturnValue(db as any)

    await claimSsoNonce('hash-2')

    expect(db.deleteMock).not.toHaveBeenCalled()
  })

  it('returns a generic error (fail-closed) and logs no payload contents on other insert failures', async () => {
    const db = makeMockDb({ insertError: { code: '500', message: 'db unavailable' } })
    vi.mocked(createAdminClient).mockReturnValue(db as any)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await claimSsoNonce('hash-3')

    expect(result).toEqual({ ok: false, reason: 'error' })
    expect(errSpy).toHaveBeenCalledWith('[embedded-sso] nonce insert failed:', 'db unavailable')
  })

  it('cleanup failure is non-fatal — claim still resolves ok and the error is only logged', async () => {
    const db = makeMockDb({ deleteError: { message: 'cleanup boom' } })
    vi.mocked(createAdminClient).mockReturnValue(db as any)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await claimSsoNonce('hash-4')
    expect(result).toEqual({ ok: true })

    // Cleanup runs unawaited — flush the microtask queue before asserting on it.
    await Promise.resolve()
    await Promise.resolve()

    expect(errSpy).toHaveBeenCalledWith('[embedded-sso] nonce cleanup failed:', 'cleanup boom')
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { logAudit } from '@/lib/audit/log'

// ─────────────────────────────────────────────────────────────────────────────
// REFACTOR SAFETY ONLY — THIS FILE IS NOT EVIDENCE THE AUDIT TRAIL WORKS.
//
// Every test here hands logAudit a FAKE Supabase client. A fake has no column
// types, no enum, no RLS and no constraints, so a mocked insert succeeds
// whether or not the real `audit_logs.action` column would accept the value.
// The bug this change exists for — a dotted action string rejected by the
// `audit_action` enum, 22P02, zero rows ever written — would pass every
// assertion below while the production table stayed empty. A green run here
// says the control flow is intact; it says nothing about the database.
//
// What these tests DO protect: that a returned `{ error }` is read and logged
// rather than discarded, that a thrown error is still caught, and that neither
// path throws at the caller. Those are exactly the properties a future
// refactor could quietly undo.
//
// The real proof is a live insert against the migrated column, followed by
// `select count(*) from audit_logs`. That check is outstanding.
// ─────────────────────────────────────────────────────────────────────────────

function makeClient(result: { error: { message: string } | null } | Error) {
  const insert = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  )
  return { client: { from: vi.fn(() => ({ insert })) } as any, insert }
}

let errSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  errSpy.mockRestore()
})

describe('logAudit', () => {
  it('writes the row with the expected column mapping', async () => {
    const { client, insert } = makeClient({ error: null })

    await logAudit(client, 'org-1', 'user-1', 'certificate.bulk_issue', 'events', 'event-1', {
      issued: 3,
    })

    expect(client.from).toHaveBeenCalledWith('audit_logs')
    expect(insert).toHaveBeenCalledWith({
      org_id: 'org-1',
      user_id: 'user-1',
      action: 'certificate.bulk_issue',
      table_name: 'events',
      record_id: 'event-1',
      new_data: { issued: 3 },
    })
  })

  it('maps omitted optionals to null rather than undefined', async () => {
    const { client, insert } = makeClient({ error: null })

    await logAudit(client, null, null, 'org.create')

    expect(insert).toHaveBeenCalledWith({
      org_id: null,
      user_id: null,
      action: 'org.create',
      table_name: null,
      record_id: null,
      new_data: null,
    })
  })

  it('says nothing when the insert succeeds', async () => {
    const { client } = makeClient({ error: null })

    await logAudit(client, 'org-1', null, 'org.update')

    expect(errSpy).not.toHaveBeenCalled()
  })

  // ── The regression this change is about ──────────────────────────────────
  it('LOGS a returned { error } instead of discarding it', async () => {
    // postgrest-js does not throw on a constraint violation — it resolves with
    // { error }. The previous implementation never read the return value, so
    // this path produced no output at all and the bare catch never fired.
    const { client } = makeClient({
      error: { message: 'invalid input value for enum audit_action: "certificate.bulk_issue"' },
    })

    await logAudit(client, 'org-1', null, 'certificate.bulk_issue')

    expect(errSpy).toHaveBeenCalledTimes(1)
    const [prefix, message, ctx] = errSpy.mock.calls[0]
    // 'insert failed', specifically — NOT the 'threw' wording. Rethrowing the
    // returned error into the catch below would also produce a log line and
    // also not surface to the caller, so a looser assertion here passes on an
    // implementation that reports a PostgREST rejection as a transport
    // failure. The two mean different things to whoever reads the log.
    expect(prefix).toContain('insert failed')
    expect(prefix).not.toContain('threw')
    expect(message).toContain('invalid input value for enum audit_action')
    // The action is load-bearing in the message: this failure was
    // value-specific, and a log line without it would not identify which call
    // sites were broken.
    expect(ctx).toEqual({ action: 'certificate.bulk_issue' })
  })

  it('does NOT throw when the insert returns an error', async () => {
    const { client } = makeClient({ error: { message: 'boom' } })

    // Callers treat auditing as fire-and-forget. Surfacing this would turn a
    // bookkeeping failure into a user-visible one.
    await expect(logAudit(client, 'org-1', null, 'ticket.create')).resolves.toBeUndefined()
  })

  it('still catches a THROWN error, and logs it distinctly', async () => {
    const { client } = makeClient(new Error('fetch failed'))

    await expect(logAudit(client, 'org-1', null, 'ticket.create')).resolves.toBeUndefined()

    expect(errSpy).toHaveBeenCalledTimes(1)
    const [prefix, message] = errSpy.mock.calls[0]
    // Distinct wording from the returned-error path: a throw means the request
    // never reached PostgREST, which is a different problem to diagnose.
    expect(prefix).toContain('threw')
    expect(message).toContain('fetch failed')
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeFakeAdmin, type Recorded } from './fake-supabase'

const triggerMock = vi.hoisted(() => vi.fn())
const pushMock = vi.hoisted(() => vi.fn())

vi.mock('@trigger.dev/sdk/v3', () => ({
  schedules: { task: (opts: any) => opts },
  tasks: { trigger: triggerMock },
}))
vi.mock('@/lib/push/send', () => ({
  sendAnnouncementPush: pushMock,
}))

import { runScheduledAnnouncementsPoll } from '../scheduled-announcements'

function buildResolver(cfg: { dueRows: any[]; claimResults?: Record<string, boolean> }) {
  return (call: Recorded) => {
    if (call.table !== 'announcements') throw new Error(`unexpected table: ${call.table}`)
    if (call.mode === 'select') return { data: cfg.dueRows, error: null }
    if (call.mode === 'update') {
      if (call.orFilter) {
        const id = call.filters.id?.eq
        const claims = cfg.claimResults?.[id] ?? true
        return { data: claims ? { id } : null, error: null }
      }
      return { data: null, error: null } // terminal write ack
    }
    throw new Error(`unexpected call: ${JSON.stringify(call)}`)
  }
}

describe('runScheduledAnnouncementsPoll', () => {
  beforeEach(() => {
    triggerMock.mockReset()
    triggerMock.mockResolvedValue({ id: 'run_1' })
    pushMock.mockReset()
  })

  it('selects due-scheduled + stale-sending rows and does NOT pre-lock email/both rows', async () => {
    const dueRows = [
      { id: 'a1', event_id: 'e1', title: 'T1', body: 'B1', channel: 'email' },
      { id: 'a2', event_id: 'e2', title: 'T2', body: 'B2', channel: 'both' },
    ]
    const { admin, calls } = makeFakeAdmin(buildResolver({ dueRows }))

    const result = await runScheduledAnnouncementsPoll(admin as any)

    const selectCall = calls.find((c) => c.mode === 'select')
    expect(selectCall?.orFilter).toMatch(
      /^and\(status\.eq\.scheduled,scheduled_for\.lte\.[0-9T:.Z-]+\),and\(status\.eq\.sending,updated_at\.lt\.[0-9T:.Z-]+\)$/,
    )

    expect(triggerMock).toHaveBeenCalledWith(
      'send-announcement',
      { announcementId: 'a1' },
      { idempotencyKey: 'a1', idempotencyKeyTTL: '10m' },
    )
    expect(triggerMock).toHaveBeenCalledWith(
      'send-announcement',
      { announcementId: 'a2' },
      { idempotencyKey: 'a2', idempotencyKeyTTL: '10m' },
    )

    // The poller must never pre-set 'sending' for email/both rows — claim lives in the delivery task.
    expect(calls.some((c) => c.mode === 'update')).toBe(false)
    expect(result).toEqual({ processed: 2, enqueued: 2 })
  })

  it('claims and terminalizes a push-only row', async () => {
    const dueRows = [{ id: 'p1', event_id: 'e1', title: 'T1', body: 'B1', channel: 'push' }]
    const { admin, calls } = makeFakeAdmin(buildResolver({ dueRows, claimResults: { p1: true } }))
    pushMock.mockResolvedValue(undefined)

    const result = await runScheduledAnnouncementsPoll(admin as any)

    expect(pushMock).toHaveBeenCalledWith('e1', 'T1', 'B1')

    const claimCall = calls.find((c) => c.mode === 'update' && c.orFilter)
    expect(claimCall?.orFilter).toMatch(
      /^status\.in\.\(scheduled,draft\),and\(status\.eq\.sending,updated_at\.lt\.[0-9T:.Z-]+\)$/,
    )

    const terminalCall = calls.find((c) => c.mode === 'update' && !c.orFilter)
    expect(terminalCall?.payload).toMatchObject({ status: 'sent', recipient_count: 0 })
    expect(terminalCall?.payload.sent_at).toBeTruthy()

    expect(triggerMock).not.toHaveBeenCalled()
    expect(result).toEqual({ processed: 1, enqueued: 1 })
  })

  it('skips a push-only row that fails to claim — owned by another run or terminal', async () => {
    const dueRows = [{ id: 'p1', event_id: 'e1', title: 'T1', body: 'B1', channel: 'push' }]
    const { admin, calls } = makeFakeAdmin(buildResolver({ dueRows, claimResults: { p1: false } }))

    const result = await runScheduledAnnouncementsPoll(admin as any)

    expect(pushMock).not.toHaveBeenCalled()
    expect(calls.some((c) => c.mode === 'update' && !c.orFilter)).toBe(false) // no terminal write for a row we never claimed
    expect(result).toEqual({ processed: 1, enqueued: 0 })
  })

  it('writes status=failed when a claimed push-only send throws — never left stranded in sending', async () => {
    const dueRows = [{ id: 'p1', event_id: 'e1', title: 'T1', body: 'B1', channel: 'push' }]
    const { admin, calls } = makeFakeAdmin(buildResolver({ dueRows, claimResults: { p1: true } }))
    pushMock.mockRejectedValue(new Error('push boom'))

    const result = await runScheduledAnnouncementsPoll(admin as any)

    const terminalCall = calls.find((c) => c.mode === 'update' && !c.orFilter)
    expect(terminalCall?.payload).toMatchObject({ status: 'failed' })
    expect(result).toEqual({ processed: 1, enqueued: 0 })
  })

  it('a failed delivery-task dispatch for email/both only logs — does not write row status', async () => {
    const dueRows = [{ id: 'a1', event_id: 'e1', title: 'T1', body: 'B1', channel: 'email' }]
    const { admin, calls } = makeFakeAdmin(buildResolver({ dueRows }))
    triggerMock.mockRejectedValue(new Error('dispatch boom'))

    await expect(runScheduledAnnouncementsPoll(admin as any)).resolves.toEqual({
      processed: 1,
      enqueued: 0,
    })

    expect(calls.some((c) => c.mode === 'update')).toBe(false)
  })
})

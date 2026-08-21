import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@trigger.dev/sdk/v3', () => ({
  tasks: { trigger: vi.fn() },
}))

import { tasks } from '@trigger.dev/sdk/v3'
import { enqueueGhlSync } from './trigger'

const SYNC_STATE_ID = '9f0c2b1a-0000-4000-8000-00000000abcd'

const payload = {
  registrationId:  'reg-1',
  ghlLocationId:   '4KrDX2FYA2XZ68q88rFS',
  ghlContactId:    'contact-1',
  ghlOrderId:      'order-1',
  ticketTypeTitle: 'General Admission',
  eventId:         'event-1',
  eventTitle:      'Birmingham IEO',
  eventSlug:       'birmingham-ieo',
  attendeeName:    'Ada Lovelace',
  amountPaidCents: 5000,
  paymentStatus:   'paid',
  syncStateId:     SYNC_STATE_ID,
}

const originalKey = process.env.TRIGGER_SECRET_KEY

beforeEach(() => {
  process.env.TRIGGER_SECRET_KEY = 'tr_test_key'
  vi.mocked(tasks.trigger).mockReset().mockResolvedValue({ id: 'run_1' } as any)
})

afterEach(() => {
  if (originalKey === undefined) delete process.env.TRIGGER_SECRET_KEY
  else process.env.TRIGGER_SECRET_KEY = originalKey
})

describe('enqueueGhlSync — idempotent enqueue', () => {
  it('passes an idempotency key derived from the sync_state row id', async () => {
    await enqueueGhlSync(payload)

    expect(tasks.trigger).toHaveBeenCalledWith(
      'sync-ghl-registration',
      payload,
      expect.objectContaining({ idempotencyKey: `sync-ghl-registration:${SYNC_STATE_ID}:0` }),
    )
  })

  it('bounds the key with a TTL so a deliberate later re-sync still runs', async () => {
    await enqueueGhlSync(payload)

    const options = vi.mocked(tasks.trigger).mock.calls[0][2] as { idempotencyKeyTTL?: string }
    expect(options.idempotencyKeyTTL).toBe('1h')
  })

  it('gives the two webhook transports the same key for one order', async () => {
    // Both transports resolve to the one shared ghl_sync_state row, and differ
    // only in fields the key must not depend on.
    await enqueueGhlSync(payload)
    await enqueueGhlSync({ ...payload, attendeeName: 'Ada L.', amountPaidCents: 5001 })

    const [first, second] = vi.mocked(tasks.trigger).mock.calls.map(
      call => (call[2] as { idempotencyKey?: string }).idempotencyKey,
    )
    expect(first).toBe(second)
  })

  it('lets a re-drive through: a higher attempt count is a different key', async () => {
    // Trigger.dev hands back the cached run for a live key whatever its
    // outcome, so a re-drive after a failed run must not reuse the key — the
    // row would sit at queued_for_sync with nothing in flight.
    await enqueueGhlSync(payload, 0)
    await enqueueGhlSync(payload, 1)

    const [first, second] = vi.mocked(tasks.trigger).mock.calls.map(
      call => (call[2] as { idempotencyKey?: string }).idempotencyKey,
    )
    expect(first).not.toBe(second)
  })

  it('two transports re-driving off the same failure still collapse', async () => {
    await enqueueGhlSync(payload, 2)
    await enqueueGhlSync(payload, 2)

    const [first, second] = vi.mocked(tasks.trigger).mock.calls.map(
      call => (call[2] as { idempotencyKey?: string }).idempotencyKey,
    )
    expect(first).toBe(second)
  })

  it('gives a different order a different key', async () => {
    await enqueueGhlSync(payload)
    await enqueueGhlSync({ ...payload, syncStateId: 'other-sync-row' })

    const [first, second] = vi.mocked(tasks.trigger).mock.calls.map(
      call => (call[2] as { idempotencyKey?: string }).idempotencyKey,
    )
    expect(first).not.toBe(second)
  })
})

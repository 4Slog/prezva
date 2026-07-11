import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { makeFakeAdmin, evalClaimableWhere } from './fake-supabase'

const pushMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/push/send', () => ({
  sendAnnouncementPush: pushMock,
}))

import { runSendAnnouncement } from '../announcement'

const ANN_ID = 'ann_1'
const RECENT = () => new Date().toISOString()
const STALE = () => new Date(Date.now() - 15 * 60 * 1000).toISOString() // 15min ago, safely past the 10min claim window

function baseAnn(overrides: Record<string, any> = {}) {
  return {
    id: ANN_ID,
    event_id: 'ev_1',
    title: 'Big News',
    body: 'Something happened',
    channel: 'email',
    audience_filter: { types: [] },
    exclude_filter: { types: [] },
    status: 'scheduled',
    ...overrides,
  }
}

const validEvent = {
  title: 'Prezva Conf',
  slug: 'prezva-conf',
  organizations: { name: 'Acme Org', email: 'org@acme.com' },
}

function buildResolver(cfg: {
  annRow: any
  claimRow: { status: string; updated_at: string }
  event?: any
  registrations?: any[]
  prefs?: any[]
  suppressions?: any[]
}) {
  return (call: { table: string; mode: string; orFilter?: string }) => {
    if (call.table === 'announcements') {
      if (call.mode === 'select') return { data: cfg.annRow, error: null }
      if (call.mode === 'update') {
        if (call.orFilter) {
          const claimed = evalClaimableWhere(cfg.claimRow, call.orFilter)
          return { data: claimed ? { id: cfg.annRow.id } : null, error: null }
        }
        return { data: null, error: null } // terminal write ack
      }
    }
    if (call.table === 'events') return { data: cfg.event ?? null, error: null }
    if (call.table === 'registrations') return { data: cfg.registrations ?? [], error: null }
    if (call.table === 'attendee_preferences') return { data: cfg.prefs ?? [], error: null }
    if (call.table === 'email_suppressions') return { data: cfg.suppressions ?? [], error: null }
    if (call.table === 'user_notifications') return { data: null, error: null }
    throw new Error(`unexpected table in test: ${call.table}`)
  }
}

describe('runSendAnnouncement', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-resend-key'
    fetchMock.mockReset()
    pushMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('bails immediately when already sent — terminal, no claim attempted', async () => {
    const annRow = baseAnn({ status: 'sent' })
    const { admin, calls } = makeFakeAdmin(
      buildResolver({ annRow, claimRow: { status: 'sent', updated_at: RECENT() } }),
    )

    const result = await runSendAnnouncement(ANN_ID, admin as any)

    expect(result).toEqual({ sent: 0, failed: 0, reason: 'already sent' })
    expect(calls.some((c) => c.table === 'announcements' && c.mode === 'update')).toBe(false)
  })

  it('bails on channel === push as a defensive no-op — unreachable in normal flow', async () => {
    const annRow = baseAnn({ status: 'scheduled', channel: 'push' })
    const { admin, calls } = makeFakeAdmin(
      buildResolver({ annRow, claimRow: { status: 'scheduled', updated_at: RECENT() } }),
    )

    const result = await runSendAnnouncement(ANN_ID, admin as any)

    expect(result).toEqual({ sent: 0, failed: 0, reason: 'push-only — no email sent' })
    expect(calls.some((c) => c.table === 'announcements' && c.mode === 'update')).toBe(false)
  })

  it('claims a scheduled row and proceeds', async () => {
    const annRow = baseAnn({ status: 'scheduled' })
    const { admin, calls } = makeFakeAdmin(
      buildResolver({
        annRow,
        claimRow: { status: 'scheduled', updated_at: RECENT() },
        event: validEvent,
        registrations: [],
      }),
    )

    const result = await runSendAnnouncement(ANN_ID, admin as any)

    expect(result).toEqual({ sent: 0, failed: 0, reason: 'no eligible recipients' })
    expect(calls.some((c) => c.table === 'events')).toBe(true) // pipeline continued past the claim
  })

  it('claims a draft row and proceeds', async () => {
    const annRow = baseAnn({ status: 'draft' })
    const { admin, calls } = makeFakeAdmin(
      buildResolver({
        annRow,
        claimRow: { status: 'draft', updated_at: RECENT() },
        event: validEvent,
        registrations: [],
      }),
    )

    const result = await runSendAnnouncement(ANN_ID, admin as any)

    expect(result).toEqual({ sent: 0, failed: 0, reason: 'no eligible recipients' })
    expect(calls.some((c) => c.table === 'events')).toBe(true)
  })

  it('does NOT reclaim a sending row with a RECENT updated_at — owned by a live run', async () => {
    const annRow = baseAnn({ status: 'sending' })
    const { admin, calls } = makeFakeAdmin(
      buildResolver({ annRow, claimRow: { status: 'sending', updated_at: RECENT() } }),
    )

    const result = await runSendAnnouncement(ANN_ID, admin as any)

    expect(result).toEqual({ sent: 0, failed: 0, reason: 'not claimable — owned by another run or terminal' })
    expect(calls.some((c) => c.table === 'events')).toBe(false) // pipeline never proceeded
  })

  it('RECLAIMS a sending row whose updated_at is older than 10 minutes — stale recovery', async () => {
    const annRow = baseAnn({ status: 'sending' })
    const claimRow = { status: 'sending', updated_at: STALE() }
    const { admin, calls } = makeFakeAdmin(
      buildResolver({ annRow, claimRow, event: validEvent, registrations: [] }),
    )

    const result = await runSendAnnouncement(ANN_ID, admin as any)

    expect(result).toEqual({ sent: 0, failed: 0, reason: 'no eligible recipients' })

    const claimCall = calls.find((c) => c.table === 'announcements' && c.mode === 'update' && c.orFilter)
    expect(claimCall).toBeTruthy()
    expect(claimCall!.orFilter).toMatch(
      /^status\.in\.\(scheduled,draft\),and\(status\.eq\.sending,updated_at\.lt\.[0-9T:.Z-]+\)$/,
    )
    // Prove the WHERE itself reclaims a stale 'sending' row but not a fresh one.
    expect(evalClaimableWhere(claimRow, claimCall!.orFilter!)).toBe(true)
    expect(evalClaimableWhere({ status: 'sending', updated_at: RECENT() }, claimCall!.orFilter!)).toBe(false)
  })

  it('writes status=failed (not a stranded sending) when the body throws on an empty merge-tag title', async () => {
    const annRow = baseAnn({ status: 'scheduled' })
    const { admin, calls } = makeFakeAdmin(
      buildResolver({
        annRow,
        claimRow: { status: 'scheduled', updated_at: RECENT() },
        event: { ...validEvent, title: '' }, // triggers the merge-tag throw
      }),
    )

    await expect(runSendAnnouncement(ANN_ID, admin as any)).rejects.toThrow(/merge-tag/)

    const failedWrite = calls.find(
      (c) => c.table === 'announcements' && c.mode === 'update' && !c.orFilter && c.payload?.status === 'failed',
    )
    expect(failedWrite).toBeTruthy()
  })

  it('writes terminal sent/recipient_count=0 on zero recipients pre-filter', async () => {
    const annRow = baseAnn({ status: 'scheduled' })
    const { admin, calls } = makeFakeAdmin(
      buildResolver({
        annRow,
        claimRow: { status: 'scheduled', updated_at: RECENT() },
        event: validEvent,
        registrations: [],
      }),
    )

    const result = await runSendAnnouncement(ANN_ID, admin as any)

    expect(result).toEqual({ sent: 0, failed: 0, reason: 'no eligible recipients' })
    const terminalWrite = calls.find(
      (c) => c.table === 'announcements' && c.mode === 'update' && !c.orFilter,
    )
    expect(terminalWrite?.payload).toMatchObject({ status: 'sent', recipient_count: 0 })
  })

  it('writes terminal sent/recipient_count=0 on zero recipients post-suppression', async () => {
    const annRow = baseAnn({ status: 'scheduled' })
    const { admin, calls } = makeFakeAdmin(
      buildResolver({
        annRow,
        claimRow: { status: 'scheduled', updated_at: RECENT() },
        event: validEvent,
        registrations: [
          { id: 'r1', attendee_email: 'a@x.com', attendee_name: 'A B', ticket_type_id: null, user_id: null },
        ],
        prefs: [],
        suppressions: [{ email: 'a@x.com' }],
      }),
    )

    const result = await runSendAnnouncement(ANN_ID, admin as any)

    expect(result).toEqual({ sent: 0, failed: 0, reason: 'no eligible recipients' })
    const terminalWrites = calls.filter(
      (c) => c.table === 'announcements' && c.mode === 'update' && !c.orFilter,
    )
    expect(terminalWrites).toHaveLength(1) // only the post-suppression checkpoint fired
    expect(terminalWrites[0].payload).toMatchObject({ status: 'sent', recipient_count: 0 })
  })

  it("channel 'both' fires push after claim; a push failure does not abort the email path", async () => {
    const annRow = baseAnn({ status: 'scheduled', channel: 'both' })
    pushMock.mockRejectedValueOnce(new Error('push boom'))
    const { admin } = makeFakeAdmin(
      buildResolver({
        annRow,
        claimRow: { status: 'scheduled', updated_at: RECENT() },
        event: validEvent,
        registrations: [],
      }),
    )

    const result = await runSendAnnouncement(ANN_ID, admin as any)

    expect(pushMock).toHaveBeenCalledWith('ev_1', 'Big News', 'Something happened')
    expect(result).toEqual({ sent: 0, failed: 0, reason: 'no eligible recipients' }) // email path still completed
  })

  it('sends email successfully and writes terminal sent with the real recipient_count', async () => {
    const annRow = baseAnn({ status: 'scheduled' })
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    const { admin, calls } = makeFakeAdmin(
      buildResolver({
        annRow,
        claimRow: { status: 'scheduled', updated_at: RECENT() },
        event: validEvent,
        registrations: [
          { id: 'r1', attendee_email: 'a@x.com', attendee_name: 'A B', ticket_type_id: null, user_id: null },
        ],
        prefs: [],
        suppressions: [],
      }),
    )

    const result = await runSendAnnouncement(ANN_ID, admin as any)

    expect(result).toEqual({ sent: 1, failed: 0 })
    const terminalWrite = calls.find(
      (c) => c.table === 'announcements' && c.mode === 'update' && !c.orFilter,
    )
    expect(terminalWrite?.payload).toMatchObject({ status: 'sent', recipient_count: 1 })
  })
})

// Batch B commit 1: every fixed action refuses a caller without the permission
// (or pointing at another event's row) and writes nothing.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({
  db: null as any,
  allowed: new Set<string>(),
  identity: { type: 'anonymous' } as any,
  owned: null as any,
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.db.client) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.db.client) }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => h.db.client) }))
vi.mock('@/lib/auth/get-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'user-1' })),
  getUser: vi.fn(async () => ({ id: 'user-1' })),
}))
vi.mock('@/lib/auth/assert-permission', async () => {
  const { PermissionError } = await import('@/lib/auth/permission-error')
  const check = async (org: string, _u: string, key: string) => {
    if (!h.allowed.has(`${org}:${key}`)) throw new PermissionError(key)
  }
  return {
    assertPermission: vi.fn(check),
    hasPermission: vi.fn(async (o: string, u: string, k: string) => check(o, u, k).then(() => true, () => false)),
    getOrgPermissions: vi.fn(async () => new Set()),
    permits: vi.fn(() => false),
  }
})
vi.mock('@/lib/auth/session-identity', () => ({ getSessionIdentity: vi.fn(async () => h.identity) }))
vi.mock('@/lib/auth/owned-registration', () => ({ resolveOwnedRegistration: vi.fn(async () => h.owned) }))
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn(async () => {}), isUuid: () => true }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/trigger', async () => (await import('./helpers/auto-mock')).autoMockModule())
vi.mock('@/lib/push/send', async () => (await import('./helpers/auto-mock')).autoMockModule())
vi.mock('@/lib/stripe/checkout', async () => (await import('./helpers/auto-mock')).autoMockModule())
vi.mock('@/lib/integrations/_shared/association-verify', async () => (await import('./helpers/auto-mock')).autoMockModule())
vi.mock('@/lib/certificates/issue-core', async () => (await import('./helpers/auto-mock')).autoMockModule())
vi.mock('@/lib/ratelimit', async () => (await import('./helpers/auto-mock')).autoMockModule({
  checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 9 })),
}))

import { upsertRosItem, updateRosItemStatus, updateRosItemStatusByMcToken, deleteRosItem, importSessionsToRos } from '@/lib/events/run-of-show-actions'
import { deleteAnnouncement } from '@/lib/announcements/actions'
import { deleteHandout, deleteHandoutAsOrg, markQuestionAnswered } from '@/lib/speaker/speaker-actions'
import { reorderFormFields } from '@/lib/events/form-field-actions'
import { activatePoll, closePoll, showResults } from '@/lib/engagement/poll-actions'
import { upsertCertificateTemplate } from '@/lib/certificates/actions'
import { resolveVolunteerAlert } from '@/lib/volunteers/actions'
import { virtualCheckIn } from '@/lib/registration/actions'
import { getOrCreateConversation } from '@/lib/messaging/actions'
import { logAudit } from '@/lib/audit/log'

const FUTURE = new Date(Date.now() + 86400000).toISOString()

function seed() {
  h.db = createFakeDb({
    events: [
      { id: 'e1', org_id: 'orgA', slug: 'ev-a', mc_token: 'mc-a', timezone: 'America/New_York' },
      { id: 'e2', org_id: 'orgB', slug: 'ev-b', mc_token: 'mc-b', timezone: 'America/New_York' },
    ],
    run_of_show_items: [
      { id: 'r1', event_id: 'e1', title: 'Doors', status: 'upcoming' },
      { id: 'r2', event_id: 'e2', title: 'Keynote', status: 'upcoming' },
    ],
    sessions: [
      { id: 's-a', event_id: 'e1', title: 'A', starts_at: '2026-10-06T19:00:00Z', ends_at: '2026-10-06T20:00:00Z' },
      { id: 's-b', event_id: 'e2', title: 'B', starts_at: '2026-10-06T19:00:00Z', ends_at: '2026-10-06T20:00:00Z' },
    ],
    announcements: [{ id: 'an2', event_id: 'e2', title: 'Hi' }],
    session_handouts: [
      { id: 'h1', session_id: 's-a', speaker_id: 'sp1', storage_path: 'a/h1.pdf' },
      { id: 'h2', session_id: 's-a', speaker_id: 'sp2', storage_path: 'a/h2.pdf' },
      { id: 'hb', session_id: 's-b', speaker_id: 'sp9', storage_path: 'b/hb.pdf' },
    ],
    // Portal links are speakers.confirmation_token (D-R3); the event rides on the row.
    speakers: [{ id: 'sp1', event_id: 'e1', name: 'Ann', email: null, status: 'confirmed', confirmation_token: 'tok-sp1', portal_token_expires_at: null, events: { id: 'e1', title: 'A', slug: 'ev-a', start_at: FUTURE, end_at: FUTURE } }],
    session_speakers: [{ session_id: 's-a', speaker_id: 'sp1' }],
    session_questions: [
      { id: 'q1', session_id: 's-a', event_id: 'e1', answered_at: null },
      { id: 'q-other', session_id: 's-x', event_id: 'e1', answered_at: null },
      { id: 'q-b', session_id: 's-b', event_id: 'e2', answered_at: null },
    ],
    form_fields: [
      { id: 'f1', event_id: 'e1', sort_order: 0 },
      { id: 'f2', event_id: 'e1', sort_order: 1 },
      { id: 'fb', event_id: 'e2', sort_order: 0 },
    ],
    session_polls: [
      { id: 'p-b', session_id: 's-b', event_id: 'e2', is_active: false, show_results: false },
      { id: 'p-b2', session_id: 's-b', event_id: 'e2', is_active: true, show_results: false },
    ],
    certificate_templates: [{ id: 't-b', org_id: 'orgB', name: 'B', is_default: true }],
    volunteer_alerts: [{ id: 'al-b', event_id: 'e2', resolved: false }],
    registrations: [{ id: 'reg1', event_id: 'e1', status: 'confirmed', delivery_method: 'virtual' }],
    check_ins: [],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.allowed = new Set()
  h.identity = { type: 'anonymous' }
  h.owned = null
  seed()
})

const noWrites = () => expect(h.db.writes.filter((w: any) => w.matched > 0)).toEqual([])

describe('O115 run of show', () => {
  it('status change on another org\'s item is refused and writes nothing', async () => {
    h.allowed.add('orgA:run_of_show.manage')
    const res = await updateRosItemStatus('r2', 'done')
    expect(res).toHaveProperty('error')
    noWrites()
  })

  it('upsert of an existing item checks the ITEM\'s event, not the caller\'s eventId', async () => {
    h.allowed.add('orgA:run_of_show.manage')
    const res = await upsertRosItem('e1', { id: 'r2', time_at: '2026-10-06T19:00:00Z', duration_minutes: 5, title: 'Hijack' })
    expect(res).toHaveProperty('error')
    noWrites()
  })

  it('upsert never rewrites event_id on an existing row', async () => {
    h.allowed.add('orgA:run_of_show.manage')
    const res = await upsertRosItem('e2', { id: 'r1', time_at: '2026-10-06T19:00:00Z', duration_minutes: 5, title: 'Renamed' })
    expect(res).toEqual({ ok: true })
    const r1 = h.db.tables.run_of_show_items.find((r: any) => r.id === 'r1')
    expect(r1).toMatchObject({ event_id: 'e1', title: 'Renamed' })
  })

  it('member without run_of_show.manage cannot delete or import', async () => {
    h.allowed.add('orgA:run_of_show.view')
    expect(await deleteRosItem('r1')).toHaveProperty('error')
    expect(await importSessionsToRos('e1')).toHaveProperty('error')
    noWrites()
  })

  it('permitted delete removes exactly the row', async () => {
    h.allowed.add('orgA:run_of_show.manage')
    expect(await deleteRosItem('r1')).toEqual({ ok: true })
    expect(h.db.tables.run_of_show_items.map((r: any) => r.id)).toEqual(['r2'])
  })

  it('MC token may change status only on its own event', async () => {
    expect(await updateRosItemStatusByMcToken('mc-a', 'r2', 'done')).toHaveProperty('error')
    expect(await updateRosItemStatusByMcToken('nope', 'r1', 'done')).toHaveProperty('error')
    noWrites()
    expect(await updateRosItemStatusByMcToken('mc-a', 'r1', 'in_progress')).toEqual({ ok: true })
    expect(h.db.tables.run_of_show_items.find((r: any) => r.id === 'r1').status).toBe('in_progress')
  })

  it('MC token rejects a non-status value', async () => {
    expect(await updateRosItemStatusByMcToken('mc-a', 'r1', 'deleted' as any)).toHaveProperty('error')
    noWrites()
  })
})

describe('O122 deleteAnnouncement', () => {
  it('another event\'s announcement via a permitted eventId is refused', async () => {
    h.allowed.add('orgA:announcements.send')
    const res = await deleteAnnouncement('an2', 'e1')
    expect(res).toHaveProperty('error')
    noWrites()
  })

  it('no permission on the row\'s own event is refused', async () => {
    h.allowed.add('orgA:announcements.send')
    expect(await deleteAnnouncement('an2', 'e2')).toHaveProperty('error')
    noWrites()
  })

  it('permitted delete audits the row\'s real event', async () => {
    h.allowed.add('orgB:announcements.send')
    expect(await deleteAnnouncement('an2', 'e2')).toEqual({ success: true })
    expect(h.db.tables.announcements).toEqual([])
    expect(logAudit).toHaveBeenCalledWith(expect.anything(), 'orgB', 'user-1', 'announcement.delete', 'announcements', 'an2', undefined, { eventId: 'e2' })
  })
})

describe('handouts and speaker Q&A', () => {
  it('deleteHandoutAsOrg refuses a handout of another org\'s event', async () => {
    h.allowed.add('orgA:speakers.manage')
    expect(await deleteHandoutAsOrg('hb', 'orgA')).toHaveProperty('error')
    noWrites()
    expect(h.db.removedFiles).toEqual([])
  })

  it('speaker token cannot delete another speaker\'s handout', async () => {
    expect(await deleteHandout('tok-sp1', 'h2')).toHaveProperty('error')
    expect(await deleteHandout('bad-token', 'h1')).toHaveProperty('error')
    noWrites()
    expect(h.db.removedFiles).toEqual([])
  })

  it('speaker token deletes its own handout', async () => {
    expect(await deleteHandout('tok-sp1', 'h1')).toEqual({})
    expect(h.db.tables.session_handouts.map((r: any) => r.id)).toEqual(['h2', 'hb'])
    expect(h.db.removedFiles).toEqual(['a/h1.pdf'])
  })

  it('speaker token cannot answer a question on a session it is not on, or another event', async () => {
    expect(await markQuestionAnswered('tok-sp1', 'q-other')).toHaveProperty('error')
    expect(await markQuestionAnswered('tok-sp1', 'q-b')).toHaveProperty('error')
    expect(await markQuestionAnswered('bad', 'q1')).toHaveProperty('error')
    noWrites()
    expect(await markQuestionAnswered('tok-sp1', 'q1')).toEqual({})
    expect(h.db.tables.session_questions.find((q: any) => q.id === 'q1').answered_at).not.toBeNull()
  })
})

describe('reorderFormFields', () => {
  it('refuses when any field belongs to a different event, before any update', async () => {
    h.allowed.add('orgA:event.manage')
    expect(await reorderFormFields(['f1', 'fb', 'f2'])).toHaveProperty('error')
    noWrites()
  })

  it('refuses fields of an event the caller is not permitted on', async () => {
    h.allowed.add('orgA:event.manage')
    expect(await reorderFormFields(['fb'])).toHaveProperty('error')
    noWrites()
  })

  it('permitted reorder updates all fields of the one event', async () => {
    h.allowed.add('orgA:event.manage')
    expect(await reorderFormFields(['f2', 'f1'])).toEqual({ ok: true })
    expect(h.db.tables.form_fields.find((f: any) => f.id === 'f2').sort_order).toBe(0)
  })
})

describe('no-auth admin actions now gated', () => {
  it('polls require agenda.manage on the poll\'s event', async () => {
    h.allowed.add('orgA:agenda.manage')
    expect(await activatePoll('p-b')).toHaveProperty('error')
    expect(await closePoll('p-b2')).toHaveProperty('error')
    expect(await showResults('p-b', true)).toHaveProperty('error')
    noWrites()
  })

  it('permitted activatePoll deactivates siblings and activates the poll', async () => {
    h.allowed.add('orgB:agenda.manage')
    expect(await activatePoll('p-b')).toEqual({ success: true })
    const polls = h.db.tables.session_polls
    expect(polls.find((p: any) => p.id === 'p-b').is_active).toBe(true)
    expect(polls.find((p: any) => p.id === 'p-b2').is_active).toBe(false)
  })

  it('certificate template requires org.certificate_templates', async () => {
    expect(await upsertCertificateTemplate('orgB', { name: 'X', isDefault: true, payload: {} })).toHaveProperty('error')
    noWrites()
  })

  it('certificate template of another org cannot be edited through a permitted org', async () => {
    h.allowed.add('orgA:org.certificate_templates')
    const res = await upsertCertificateTemplate('orgA', { id: 't-b', name: 'X', isDefault: true, payload: {} })
    expect(res.error).toBeTruthy()
    noWrites()
  })

  it('resolveVolunteerAlert requires volunteers.manage on the alert\'s event', async () => {
    h.allowed.add('orgA:volunteers.manage')
    expect(await resolveVolunteerAlert('al-b')).toHaveProperty('error')
    noWrites()
  })

  it('virtualCheckIn refuses a caller who does not own the registration', async () => {
    h.owned = null
    expect(await virtualCheckIn('reg1')).toHaveProperty('error')
    h.owned = { id: 'some-other-reg' }
    expect(await virtualCheckIn('reg1')).toHaveProperty('error')
    noWrites()
  })
})

describe('messaging otherUserId', () => {
  it('a non-UUID otherUserId is refused before any query', async () => {
    const res = await getOrCreateConversation('e1', 'x),or(participant_a.not.is.null')
    expect(res).toEqual({ error: 'Invalid user' })
    expect(h.db.client.from).not.toHaveBeenCalled()
  })
})

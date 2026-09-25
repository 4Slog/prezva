// Batch E1 (O147): the invite code and speaker email are service-only (0158).
// Copies of an event read them server-side after a permission check, and a
// copy of an invite-only event gets its own new code (E-R2), never the
// source's. The user client here is a separate fake whose speaker rows carry
// no email, the way RLS + 0158 return them.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({ user: null as any, admin: null as any, allow: true }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.user.client) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.admin.client) }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: 'user-1', email: 'u@x.com' })) }))
vi.mock('@/lib/auth/assert-permission', () => ({
  assertPermission: vi.fn(async (_o: string, _u: string, key: string) => {
    if (!h.allow) { const e = new Error(`no ${key}`); (e as any).name = 'PermissionError'; throw e }
  }),
}))
vi.mock('@/lib/auth/permission-error', () => ({ catchPermission: (e: unknown) => ({ error: (e as Error).message }) }))

const SOURCE = {
  id: 'e1', org_id: 'org-1', title: 'Summit', slug: 'summit', start_at: '2026-10-01T14:00:00Z', end_at: '2026-10-01T20:00:00Z',
  timezone: 'America/Chicago', recurrence: 'annual', status: 'published',
}

function setup(sourceCode: string | null) {
  h.allow = true
  h.user = createFakeDb({
    events: [SOURCE],
    speakers: [{ id: 'sp1', event_id: 'e1', name: 'Ann', status: 'confirmed' }],
    sessions: [], ticket_types: [],
  })
  h.admin = createFakeDb({
    events: [{ id: 'e1', registration_invite_code: sourceCode }],
    speakers: [{ id: 'sp1', event_id: 'e1', email: 'ann@x.com', name: 'Ann', bio: null, job_title: null, company: null }],
    event_templates: [],
  })
}
const newEvent = () => h.user.tables.events.find((e: any) => e.id !== 'e1')

describe('cloneEvent (E-R2, O147)', () => {
  beforeEach(() => setup('SOURCE-CODE'))

  it('an invite-only source gives the copy a fresh code, never the source code', async () => {
    const { cloneEvent } = await import('@/lib/productivity/sprint11-actions')
    const res = await cloneEvent('e1', 'Copy', 'copy')
    expect(res.error).toBeUndefined()
    const code = newEvent().registration_invite_code
    expect(code).toMatch(/^[A-Z2-9]{10}$/)
    expect(code).not.toBe('SOURCE-CODE')
  })

  it('an open source stays open', async () => {
    setup(null)
    const { cloneEvent } = await import('@/lib/productivity/sprint11-actions')
    await cloneEvent('e1', 'Copy', 'copy')
    expect(newEvent().registration_invite_code).toBeNull()
  })

  it('copies the speaker email read server-side', async () => {
    const { cloneEvent } = await import('@/lib/productivity/sprint11-actions')
    await cloneEvent('e1', 'Copy', 'copy')
    const copied = h.user.tables.speakers.find((s: any) => s.event_id !== 'e1')
    expect(copied).toMatchObject({ name: 'Ann', email: 'ann@x.com', status: 'invited' })
  })

  it('without event.manage nothing is read from the admin client and nothing is written', async () => {
    h.allow = false
    const { cloneEvent } = await import('@/lib/productivity/sprint11-actions')
    expect(await cloneEvent('e1', 'Copy', 'copy')).toEqual({ error: 'no event.manage' })
    expect(h.admin.client.from).not.toHaveBeenCalled()
    expect(h.user.writes).toEqual([])
  })

  it('next occurrence of an invite-only event gets a fresh code', async () => {
    const { createNextOccurrence } = await import('@/lib/productivity/sprint11-actions')
    const res = await createNextOccurrence('e1')
    expect(res.error).toBeUndefined()
    const code = newEvent().registration_invite_code
    expect(code).toMatch(/^[A-Z2-9]{10}$/)
    expect(code).not.toBe('SOURCE-CODE')
  })
})

describe('event templates (E-R2)', () => {
  beforeEach(() => setup('SOURCE-CODE'))

  it('saves whether the event was invite-only, never the code, and speaker email from the admin read', async () => {
    const { saveEventAsTemplate } = await import('@/lib/productivity/sprint11-actions')
    expect(await saveEventAsTemplate('e1', 'T', '')).toEqual({ error: undefined })
    const td = h.admin.tables.event_templates[0].template_data
    expect(td.event.requires_invite_code).toBe(true)
    expect(JSON.stringify(td)).not.toContain('SOURCE-CODE')
    expect(td.speakers[0].email).toBe('ann@x.com')
  })

  it('an event made from an invite-only template gets a fresh code', async () => {
    h.admin.tables.event_templates.push({
      id: 'tpl-1', org_id: 'org-1',
      template_data: { event: { timezone: 'America/Chicago', requires_invite_code: true }, sessions: [], tickets: [], speakers: [] },
    })
    const { createEventFromTemplate } = await import('@/lib/productivity/sprint11-actions')
    const res = await createEventFromTemplate('tpl-1', 'org-1', 'New', 'new', '2026-11-01T09:00', '2026-11-01T17:00')
    expect('error' in res ? res.error : undefined).toBeUndefined()
    expect(newEvent().registration_invite_code).toMatch(/^[A-Z2-9]{10}$/)
  })

  it('an event made from an open template has no code', async () => {
    h.admin.tables.event_templates.push({
      id: 'tpl-2', org_id: 'org-1',
      template_data: { event: { timezone: 'America/Chicago' }, sessions: [], tickets: [], speakers: [] },
    })
    const { createEventFromTemplate } = await import('@/lib/productivity/sprint11-actions')
    await createEventFromTemplate('tpl-2', 'org-1', 'New', 'new', '2026-11-01T09:00', '2026-11-01T17:00')
    expect(newEvent().registration_invite_code).toBeNull()
  })
})

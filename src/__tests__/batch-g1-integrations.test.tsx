// Batch G1 (O155, G-R1): every org_integrations write and every token read is
// on the service-role client behind org.integrations on the row's org; routes
// that act on an event or session prove it belongs to that org; the org
// integrations page keeps reading safe columns through the member's client.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { NextRequest } from 'next/server'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'u@x.com' },
  allowed: new Set<string>(),
  admin: null as unknown,
  server: null as unknown,
  calls: [] as { fn: string; args: unknown[] }[],
  // Adapter methods the routes reach: record the call, never touch a provider.
  spy: (fn: string, ret: unknown) => async (...args: unknown[]) => { h.calls.push({ fn, args }); return ret },
}))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: vi.fn((to: string) => { throw new Error(`redirect ${to}`) }) }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => h.user) }))
vi.mock('@/lib/auth/assert-permission', async () => {
  const { PermissionError } = await import('@/lib/auth/permission-error')
  return {
    assertPermission: vi.fn(async (org: string, user: string, key: string) => {
      if (!h.allowed.has(`${user}:${org}:${key}`)) throw new PermissionError(key)
    }),
    getOrgPermissions: vi.fn(async (org: string, user: string) =>
      new Set([...h.allowed].filter(k => k.startsWith(`${user}:${org}:`)).map(k => k.split(':')[2]))),
    permits: (s: Set<string>, k: string) => s.has('*') || s.has(k),
  }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.server }))

vi.mock('@/lib/integrations/constant-contact/adapter', () => ({ constantContactAdapter: { syncContacts: h.spy('cc.syncContacts', { synced: 0, errors: 0 }) } }))
vi.mock('@/lib/integrations/eventbrite/adapter', () => ({ eventbriteAdapter: { importAttendees: h.spy('eb.importAttendees', { imported: 0 }), listOrganizerEvents: h.spy('eb.listOrganizerEvents', []) } }))
vi.mock('@/lib/integrations/google-forms/adapter', () => ({ googleFormsAdapter: { importForm: h.spy('gf.importForm', { surveyId: null }) } }))
vi.mock('@/lib/integrations/mailchimp/adapter', () => ({ mailchimpAdapter: { syncAudience: h.spy('mc.syncAudience', { synced: 0 }), getLists: h.spy('mc.getLists', [{ id: 'L1', name: 'Main', memberCount: 3 }]) } }))
vi.mock('@/lib/integrations/google-drive/adapter', () => ({ googleDriveAdapter: { listFiles: h.spy('gd.listFiles', []) } }))
vi.mock('@/lib/integrations/sharepoint/adapter', () => ({ sharePointAdapter: { listFiles: h.spy('sp.listFiles', []) } }))
vi.mock('@/lib/integrations/outlook/adapter', () => ({ outlookAdapter: { createCalendarEvent: h.spy('ol.createCalendarEvent', undefined) } }))
vi.mock('@/lib/integrations/teams/adapter', () => ({ teamsAdapter: { createMeeting: h.spy('tm.createMeeting', 'https://teams/x') } }))
vi.mock('@/lib/integrations/zoom/adapter', () => ({ zoomAdapter: { createMeeting: h.spy('zm.createMeeting', 'https://zoom/x') } }))
vi.mock('@/lib/integrations/_shared/registry', () => ({
  listAdapters: () => [{ provider: 'mailchimp', displayName: 'Mailchimp', isConfigured: () => true }],
}))
vi.mock('@/app/(dashboard)/orgs/[slug]/integrations/integrations-client', () => ({
  IntegrationsClient: (p: { mailchimpLists: unknown[] }) => <div>lists:{p.mailchimpLists.length}</div>,
}))

import { POST as ccSync } from '@/app/api/integrations/constant-contact/sync/route'
import { POST as ebImport } from '@/app/api/integrations/eventbrite/import-attendees/route'
import { POST as gfImport } from '@/app/api/integrations/google-forms/import/route'
import { POST as mcSync } from '@/app/api/integrations/mailchimp/sync/route'
import { PATCH as mcConfig } from '@/app/api/integrations/mailchimp/config/route'
import { GET as mcLists } from '@/app/api/integrations/mailchimp/lists/route'
import { GET as ebList } from '@/app/api/integrations/eventbrite/list-events/route'
import { GET as gdList } from '@/app/api/integrations/google-drive/list-files/route'
import { GET as spList } from '@/app/api/integrations/sharepoint/list-files/route'
import { POST as olCreate } from '@/app/api/integrations/outlook/create-calendar-event/route'
import { POST as tmCreate } from '@/app/api/integrations/teams/create-meeting/route'
import { POST as zmCreate } from '@/app/api/integrations/zoom/create-meeting/route'
import OrgIntegrationsPage from '@/app/(dashboard)/orgs/[slug]/integrations/page'
import { INTEGRATIONS_PERMISSION, NOT_FOUND_OR_FORBIDDEN } from '@/lib/integrations/_shared/connectable'

const ORG = 'org-1'
const OTHER = 'org-2'
const EV = '11111111-1111-4111-8111-111111111111'
const FOREIGN_EV = '22222222-2222-4222-8222-222222222222'
const SESS = '33333333-3333-4333-8333-333333333333'
const FOREIGN_SESS = '44444444-4444-4444-8444-444444444444'

const json = (body: unknown, method = 'POST') => new Request('https://prezva.app/x', { method, body: JSON.stringify(body) })
const get = (qs: string) => new NextRequest(`https://prezva.app/x?${qs}`)

let admin: ReturnType<typeof createFakeDb>
beforeEach(() => {
  h.allowed.clear()
  h.calls.length = 0
  admin = createFakeDb({
    events: [{ id: EV, org_id: ORG }, { id: FOREIGN_EV, org_id: OTHER }],
    sessions: [{ id: SESS, event_id: EV, events: { org_id: ORG } }, { id: FOREIGN_SESS, event_id: FOREIGN_EV, events: { org_id: OTHER } }],
    org_integrations: [
      { id: 'm1', org_id: ORG, provider: 'mailchimp', status: 'connected', directionality_preferences: { dc: 'us1' } },
      { id: 'm2', org_id: OTHER, provider: 'mailchimp', status: 'connected', directionality_preferences: { dc: 'us2' } },
    ],
  })
  h.admin = admin.client
  h.server = createFakeDb({
    registrations: [],
    events: [{ id: EV, title: 'E' }],
    sessions: [{ id: SESS, title: 'S' }],
  }).client
})
const allow = () => h.allowed.add(`u1:${ORG}:${INTEGRATIONS_PERMISSION}`)

// The five routes that had no authorization beyond sign-in.
const eventRoutes = [
  { name: 'constant-contact/sync', call: (ev: string) => ccSync(json({ orgId: ORG, eventId: ev })), fn: 'cc.syncContacts' },
  { name: 'eventbrite/import-attendees', call: (ev: string) => ebImport(json({ orgId: ORG, eventbriteEventId: 'eb1', prezvaEventId: ev })), fn: 'eb.importAttendees' },
  { name: 'google-forms/import', call: (ev: string) => gfImport(json({ orgId: ORG, eventId: ev, formId: 'f1' })), fn: 'gf.importForm' },
  { name: 'mailchimp/sync', call: (ev: string) => mcSync(json({ orgId: ORG, eventId: ev, listId: 'L1' })), fn: 'mc.syncAudience' },
]

describe.each(eventRoutes)('$name', ({ call, fn }) => {
  it('refuses a member without org.integrations and reaches no adapter', async () => {
    h.allowed.add(`u1:${ORG}:event.manage`)
    const res = await call(EV)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe(NOT_FOUND_OR_FORBIDDEN)
    expect(h.calls).toEqual([])
  })

  it('refuses an event that belongs to another org', async () => {
    allow()
    const res = await call(FOREIGN_EV)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe(NOT_FOUND_OR_FORBIDDEN)
    expect(h.calls).toEqual([])
  })

  it('runs for org.integrations on the event\'s own org', async () => {
    allow()
    const res = await call(EV)
    expect(res.status).toBe(200)
    expect(h.calls.map(c => c.fn)).toEqual([fn])
    expect(h.calls[0].args[0]).toBe(ORG)
  })
})

it('constant-contact/sync sends the attendee columns registrations actually has', async () => {
  allow()
  h.server = createFakeDb({ registrations: [{ event_id: EV, status: 'confirmed', attendee_email: 'a@x.com', attendee_name: 'Ada Love Lace' }] }).client
  expect((await ccSync(json({ orgId: ORG, eventId: EV }))).status).toBe(200)
  expect(h.calls[0].args[1]).toEqual([{ email: 'a@x.com', firstName: 'Ada', lastName: 'Love Lace' }])
})

describe('mailchimp/config', () => {
  it('refuses a member without org.integrations and writes nothing', async () => {
    h.allowed.add(`u1:${ORG}:event.manage`)
    const res = await mcConfig(json({ orgId: ORG, defaultListId: 'L9' }, 'PATCH'))
    expect(res.status).toBe(403)
    expect(admin.writes).toEqual([])
  })

  it('writes the default list on the admin client for its own org only', async () => {
    allow()
    const res = await mcConfig(json({ orgId: ORG, defaultListId: 'L9' }, 'PATCH'))
    expect(res.status).toBe(200)
    expect(admin.tables.org_integrations.find(r => r.id === 'm1')!.directionality_preferences).toEqual({ dc: 'us1', defaultListId: 'L9' })
    expect(admin.tables.org_integrations.find(r => r.id === 'm2')!.directionality_preferences).toEqual({ dc: 'us2' })
  })

  it('cannot write another org\'s row', async () => {
    allow()
    const res = await mcConfig(json({ orgId: OTHER, defaultListId: 'L9' }, 'PATCH'))
    expect(res.status).toBe(403)
    expect(admin.writes).toEqual([])
  })
})

// Routes that read a token: the old owner/admin role check becomes org.integrations.
const tokenRoutes = [
  { name: 'mailchimp/lists', call: () => mcLists(get(`orgId=${ORG}`)), fn: 'mc.getLists' },
  { name: 'eventbrite/list-events', call: () => ebList(get(`orgId=${ORG}`)), fn: 'eb.listOrganizerEvents' },
  { name: 'google-drive/list-files', call: () => gdList(get(`orgId=${ORG}`)), fn: 'gd.listFiles' },
  { name: 'sharepoint/list-files', call: () => spList(get(`orgId=${ORG}`)), fn: 'sp.listFiles' },
]
describe.each(tokenRoutes)('$name', ({ call, fn }) => {
  it('needs org.integrations', async () => {
    expect((await call()).status).toBe(403)
    expect(h.calls).toEqual([])
    allow()
    expect((await call()).status).toBe(200)
    expect(h.calls.map(c => c.fn)).toEqual([fn])
  })
})

describe('create-meeting / calendar routes bind the session or event to the org', () => {
  it('outlook refuses a foreign event', async () => {
    allow()
    const res = await olCreate(new NextRequest('https://prezva.app/x', { method: 'POST', body: JSON.stringify({ orgId: ORG, eventId: FOREIGN_EV }) }))
    expect(res.status).toBe(403)
    expect(h.calls).toEqual([])
  })
  it.each([['teams', tmCreate], ['zoom', zmCreate]] as const)('%s refuses a foreign session and allows its own', async (_n, route) => {
    const req = (sessionId: string) => new NextRequest('https://prezva.app/x', { method: 'POST', body: JSON.stringify({ orgId: ORG, sessionId }) })
    expect((await route(req(SESS))).status).toBe(403)
    allow()
    expect((await route(req(FOREIGN_SESS))).status).toBe(403)
    expect(h.calls).toEqual([])
    expect((await route(req(SESS))).status).toBe(200)
    expect(h.calls).toHaveLength(1)
  })
})

describe('org integrations page', () => {
  const page = () => OrgIntegrationsPage({ params: Promise.resolve({ slug: 'acme' }) })
  beforeEach(() => {
    h.server = createFakeDb({
      organizations: [{ id: ORG, name: 'Acme', slug: 'acme', org_members: { user_id: 'u1', role: 'member' } }],
      org_integrations: [{ org_id: ORG, provider: 'mailchimp', status: 'connected', last_synced_at: null, directionality_preferences: { defaultListId: 'L1' } }],
    }).client
  })

  it('renders for a member without org.integrations and does not read the Mailchimp token', async () => {
    render(await page())
    expect(screen.getByText('lists:0')).toBeInTheDocument()
    expect(h.calls).toEqual([])
  })

  it('loads Mailchimp lists for a member with org.integrations', async () => {
    allow()
    render(await page())
    expect(screen.getByText('lists:1')).toBeInTheDocument()
    expect(h.calls.map(c => c.fn)).toEqual(['mc.getLists'])
  })
})

describe('adapters use the service-role client for org_integrations', () => {
  const root = join(process.cwd(), 'src/lib/integrations')
  const dirs = readdirSync(root).filter(d => d !== '_shared' && d !== 'ghl')
  it('covers all 16 non-GHL adapters', () => expect(dirs).toHaveLength(16))

  it.each(dirs)('%s: every org_integrations query sits in a method on createAdminClient', (dir) => {
    const src = readFileSync(join(root, dir, 'adapter.ts'), 'utf8')
    // Split into methods; any method touching org_integrations must not use the RLS client.
    const methods = src.split(/\n {2}(?=(?:private )?async \w+\()/)
    const touching = methods.filter(m => m.includes("from('org_integrations')"))
    expect(touching.length).toBeGreaterThanOrEqual(4)
    for (const m of touching) {
      const rls = m.includes('await createClient()')
      if (rls) {
        // eventbrite importAttendees / google-forms importForm keep the member's
        // client for registrations/surveys; their org_integrations write is admin.
        expect(m).toMatch(/createAdminClient\(\)\.from\('org_integrations'\)/)
        expect(m.match(/from\('org_integrations'\)/g)).toHaveLength(1)
      } else {
        expect(m).toContain('createAdminClient()')
      }
    }
  })
})

// Batch C commit 1a: speaker + sponsor entry points. Every door refuses a
// stranger / wrong-event / wrong-token caller, writes nothing and returns
// nothing; a portal caller can only ever post as the speaker.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({ db: null as any, allowed: new Set<string>() }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.db.client) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.db.client) }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => h.db.client) }))
vi.mock('@/lib/auth/get-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'user-1' })),
  getUser: vi.fn(async () => ({ id: 'user-1' })),
}))
vi.mock('@/lib/auth/assert-permission', async () => {
  const { PermissionError } = await import('@/lib/auth/permission-error')
  return {
    assertPermission: vi.fn(async (org: string, _u: string, key: string) => {
      if (!h.allowed.has(`${org}:${key}`)) throw new PermissionError(key)
    }),
  }
})
vi.mock('@/lib/trigger', async () => (await import('./helpers/auto-mock')).autoMockModule())

import {
  sendSpeakerMessage, sendSpeakerPortalMessage, getOrCreateSpeakerConversation, getSpeakerPortalConversation,
  getSpeakerMessages, getSpeakerPortalMessages, sendSpeakerInvite, saveSpeakerFormSubmission, createPoll,
  getSpeakersWithMissingInfo,
} from '@/lib/speaker/speaker-actions'
import { getOrCreateSpeakerToken } from '@/lib/speaker/speaker-token'
import { addSponsorContact, getSponsorContacts } from '@/lib/sponsors/portal-actions'

const FUTURE = new Date(Date.now() + 86400000).toISOString()
const fetchMock = vi.fn(async () => ({ ok: true }))

beforeEach(() => {
  vi.clearAllMocks()
  h.allowed = new Set()
  h.db = createFakeDb({
    events: [
      { id: 'e1', org_id: 'orgA', title: 'Event A', organizations: { name: 'Org <A>' } },
      { id: 'e2', org_id: 'orgB', title: 'Event B', organizations: { name: 'Org B' } },
    ],
    speakers: [
      { id: 'sp1', event_id: 'e1', name: 'Ann <b>', email: 'ann@x.test', confirmation_token: 'conf-sp1', bio: null },
      { id: 'sp2', event_id: 'e1', name: 'Bob', email: 'bob@x.test', confirmation_token: 'conf-sp2', bio: null },
      { id: 'sp9', event_id: 'e2', name: 'Zed', email: 'zed@x.test', confirmation_token: 'conf-sp9', bio: null },
    ],
    speaker_tokens: [
      { token: 'tok-sp1', event_id: 'e1', speaker_id: 'sp1', expires_at: FUTURE },
      { token: 'tok-sp9', event_id: 'e2', speaker_id: 'sp9', expires_at: FUTURE },
    ],
    speaker_conversations: [
      { id: 'c1', event_id: 'e1', speaker_id: 'sp1' },
      { id: 'c2', event_id: 'e1', speaker_id: 'sp2' },
      { id: 'c9', event_id: 'e2', speaker_id: 'sp9' },
    ],
    speaker_messages: [
      { id: 'm1', conversation_id: 'c1', sender_role: 'speaker', body: 'hi ann' },
      { id: 'm9', conversation_id: 'c9', sender_role: 'organizer', body: 'secret b' },
    ],
    sessions: [
      { id: 's-a', event_id: 'e1' },
      { id: 's-a2', event_id: 'e1' },
      { id: 's-b', event_id: 'e2' },
    ],
    session_speakers: [
      { session_id: 's-a', speaker_id: 'sp1' },
      { session_id: 's-b', speaker_id: 'sp9' },
    ],
    session_questions: [],
    speaker_form_submissions: [],
    event_sponsors: [
      { id: 'spon-a', event_id: 'e1' },
      { id: 'spon-b', event_id: 'e2' },
    ],
    sponsor_contacts: [{ id: 'sc-b', sponsor_id: 'spon-b', name: 'B rep', portal_token: 'ptok-b' }],
  })
  h.db.client.auth = { admin: { generateLink: vi.fn(async () => ({ error: null })) } }
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const noWrites = () => expect(h.db.writes.filter((w: any) => w.matched > 0)).toEqual([])

describe('speaker messaging — portal door (token)', () => {
  it('a bad token cannot read, open or post', async () => {
    expect(await getSpeakerPortalConversation('nope')).toBeNull()
    expect(await getSpeakerPortalMessages('nope')).toEqual([])
    expect(await sendSpeakerPortalMessage('nope', 'hello')).toHaveProperty('error')
    noWrites()
  })

  it('reads only the token\'s own conversation', async () => {
    const msgs = await getSpeakerPortalMessages('tok-sp1')
    expect(msgs.map((m: any) => m.id)).toEqual(['m1'])
  })

  it('posts to the token\'s conversation, always as speaker', async () => {
    expect(await sendSpeakerPortalMessage('tok-sp1', 'from ann')).toEqual({})
    const [w] = h.db.writesTo('speaker_messages')
    expect(w.values).toEqual({ conversation_id: 'c1', sender_role: 'speaker', body: 'from ann' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('speaker messaging — dashboard door (speakers.manage)', () => {
  it('a stranger cannot open, read or post', async () => {
    expect(await getOrCreateSpeakerConversation('e1', 'sp1')).toBeNull()
    expect(await getSpeakerMessages('c1')).toEqual([])
    expect(await sendSpeakerMessage('c1', 'hi')).toHaveProperty('error')
    noWrites()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('permission on org A does not reach org B\'s conversation', async () => {
    h.allowed.add('orgA:speakers.manage')
    expect(await getSpeakerMessages('c9')).toEqual([])
    expect(await sendSpeakerMessage('c9', 'hi')).toHaveProperty('error')
    noWrites()
  })

  it('a speaker from another event is refused even when the caller manages the page\'s event', async () => {
    h.allowed.add('orgA:speakers.manage')
    expect(await getOrCreateSpeakerConversation('e1', 'sp9')).toBeNull()
    noWrites()
  })

  it('posts as organizer and escapes the emailed body', async () => {
    h.allowed.add('orgA:speakers.manage')
    expect(await sendSpeakerMessage('c1', '<script>x</script>')).toEqual({})
    const [w] = h.db.writesTo('speaker_messages')
    expect(w.values.sender_role).toBe('organizer')
    const html = JSON.parse((fetchMock.mock.calls[0] as any)[1].body).html as string
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(html).toContain('Ann &lt;b&gt;')
    expect(html).not.toContain('<script>')
  })
})

describe('speaker invite + token', () => {
  it('a stranger gets no token and no portal URL; nothing written', async () => {
    const res: any = await sendSpeakerInvite('e1', 'sp2')
    expect(res).toHaveProperty('error')
    expect(res.portalUrl).toBeUndefined()
    noWrites()
  })

  it('org A permission cannot invite org B\'s speaker', async () => {
    h.allowed.add('orgA:speakers.manage')
    const res: any = await sendSpeakerInvite('e2', 'sp9')
    expect(res).toHaveProperty('error')
    expect(res.portalUrl).toBeUndefined()
    noWrites()
  })

  it('the event comes from the speaker row, not the caller', async () => {
    h.allowed.add('orgA:speakers.manage')
    expect(await sendSpeakerInvite('e1', 'sp9')).toHaveProperty('error')
    noWrites()
  })

  it('getOrCreateSpeakerToken refuses a user without speakers.manage and an embed org that does not own the event', async () => {
    await expect(getOrCreateSpeakerToken('sp1', { userId: 'user-1' })).rejects.toThrow()
    expect(await getOrCreateSpeakerToken('sp1', { embedOrgId: 'orgB' })).toHaveProperty('error')
    noWrites()
    expect(await getOrCreateSpeakerToken('sp1', { embedOrgId: 'orgA' })).toEqual({ token: 'tok-sp1', eventId: 'e1' })
  })
})

describe('speaker form + poll (token)', () => {
  it('form submission: bad token writes nothing; good token writes the token\'s ids', async () => {
    expect(await saveSpeakerFormSubmission('nope', { a: '1' })).toHaveProperty('error')
    noWrites()
    expect(await saveSpeakerFormSubmission('tok-sp1', { a: '1' })).toEqual({ error: undefined })
    const [w] = h.db.writesTo('speaker_form_submissions')
    expect(w.values).toMatchObject({ event_id: 'e1', speaker_id: 'sp1', data: { a: '1' } })
  })

  it('poll: bad token, unassigned session and other-event session are refused', async () => {
    expect(await createPoll('nope', 's-a', 'Q?', ['a', 'b'])).toHaveProperty('error')
    expect(await createPoll('tok-sp1', 's-a2', 'Q?', ['a', 'b'])).toHaveProperty('error')
    expect(await createPoll('tok-sp1', 's-b', 'Q?', ['a', 'b'])).toHaveProperty('error')
    noWrites()
  })

  it('poll: the token\'s speaker on their own session can create it, on the token\'s event', async () => {
    expect(await createPoll('tok-sp1', 's-a', 'Q?', ['a', 'b'])).toEqual({ error: undefined })
    const [w] = h.db.writesTo('session_questions')
    expect(w.values).toMatchObject({ session_id: 's-a', event_id: 'e1', user_id: null, is_poll: true })
  })
})

describe('speakers missing info', () => {
  it('a stranger gets nothing', async () => {
    expect(await getSpeakersWithMissingInfo('e1', 'bio')).toEqual([])
    h.allowed.add('orgA:speakers.manage')
    expect((await getSpeakersWithMissingInfo('e1', 'bio')).length).toBe(2)
  })
})

describe('sponsor contacts', () => {
  it('a stranger cannot add a contact or read contact tokens', async () => {
    const res = await addSponsorContact('spon-a', 'Rep')
    expect(res).toHaveProperty('error')
    expect(res.portal_token).toBeUndefined()
    expect(await getSponsorContacts('spon-b')).toEqual([])
    noWrites()
  })

  it('permission on org A does not reach org B\'s sponsor', async () => {
    h.allowed.add('orgA:sponsors.manage')
    expect(await addSponsorContact('spon-b', 'Rep')).toHaveProperty('error')
    expect(await getSponsorContacts('spon-b')).toEqual([])
    noWrites()
  })

  it('sponsors.manage on the sponsor\'s org can add and list', async () => {
    h.allowed.add('orgB:sponsors.manage')
    expect(await addSponsorContact('spon-b', 'Rep 2')).not.toHaveProperty('error')
    expect((await getSponsorContacts('spon-b')).length).toBe(2)
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { sendSpeakerEmail } from '../send-speaker-email'

function createFakeAdmin(opts: { locationId: string | null; updateSpy: (payload: Record<string, unknown>) => void }) {
  return {
    from(table: string) {
      if (table === 'ghl_location_links') {
        return {
          select() { return this },
          eq() { return this },
          limit() { return this },
          single: async () => ({
            data: opts.locationId ? { ghl_location_id: opts.locationId } : null,
          }),
        }
      }
      if (table === 'speakers') {
        return {
          update(payload: Record<string, unknown>) {
            opts.updateSpy(payload)
            return { eq: async () => ({ data: null, error: null }) }
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  } as any
}

describe('sendSpeakerEmail', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    process.env.GHL_API_TOKEN = 'test-ghl-token'
    process.env.RESEND_API_KEY = 'test-resend-key'
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('(a) linked org + no ghlContactId: upserts, stores the id, sends via GHL, never hits Resend', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/contacts/upsert')) {
        return { ok: true, json: async () => ({ contact: { id: 'contact_abc' } }) }
      }
      if (url.includes('/conversations/messages')) {
        return { ok: true, json: async () => ({ messageId: 'm1', conversationId: 'c1' }) }
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const updateSpy = vi.fn()
    const admin = createFakeAdmin({ locationId: 'loc_123', updateSpy })

    const result = await sendSpeakerEmail({
      admin,
      orgId: 'org_1',
      speaker: { id: 'sp_1', name: 'Jane Doe', email: 'jane@example.com', ghlContactId: null },
      subject: 'Subject',
      html: '<p>hi</p>',
      resend: { from: 'Prezva Events <noreply@prezva.app>' },
    })

    expect(result).toEqual({ via: 'ghl', contactId: 'contact_abc' })
    expect(updateSpy).toHaveBeenCalledWith({ ghl_contact_id: 'contact_abc' })

    const urls = fetchMock.mock.calls.map((c: any[]) => c[0])
    expect(urls.some((u: string) => u.includes('/contacts/upsert'))).toBe(true)
    expect(urls.some((u: string) => u.includes('/conversations/messages'))).toBe(true)
    expect(urls.some((u: string) => u.includes('api.resend.com'))).toBe(false)
  })

  it('(b) linked org + existing ghlContactId: skips upsert and the speakers update, sends with that id', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/contacts/upsert')) {
        throw new Error('should not upsert when ghlContactId already present')
      }
      if (url.includes('/conversations/messages')) {
        return { ok: true, json: async () => ({ messageId: 'm2', conversationId: 'c2' }) }
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const updateSpy = vi.fn()
    const admin = createFakeAdmin({ locationId: 'loc_123', updateSpy })

    const result = await sendSpeakerEmail({
      admin,
      orgId: 'org_1',
      speaker: { id: 'sp_1', name: 'Jane Doe', email: 'jane@example.com', ghlContactId: 'existing_123' },
      subject: 'Subject',
      html: '<p>hi</p>',
      resend: { from: 'Prezva Events <noreply@prezva.app>' },
    })

    expect(result).toEqual({ via: 'ghl', contactId: 'existing_123' })
    expect(updateSpy).not.toHaveBeenCalled()

    const messageCall = fetchMock.mock.calls.find((c: any[]) => (c[0] as string).includes('/conversations/messages'))
    expect(messageCall).toBeTruthy()
    const body = JSON.parse(messageCall![1].body)
    expect(body.contactId).toBe('existing_123')
  })

  it('(c) standalone org (no location): sends via Resend with from/to/subject/html/text, never hits GHL', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('api.resend.com')) {
        return { ok: true, json: async () => ({ id: 'email_1' }) }
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const updateSpy = vi.fn()
    const admin = createFakeAdmin({ locationId: null, updateSpy })

    const result = await sendSpeakerEmail({
      admin,
      orgId: 'org_2',
      speaker: { id: 'sp_2', name: 'Sam Lee', email: 'sam@example.com' },
      subject: 'Subject',
      html: '<p>hi</p>',
      text: 'hi',
      resend: { from: 'Org <noreply@prezva.app>', replyTo: 'org@example.com' },
    })

    expect(result).toEqual({ via: 'resend' })

    const resendCall = fetchMock.mock.calls.find((c: any[]) => (c[0] as string).includes('api.resend.com'))
    expect(resendCall).toBeTruthy()
    const body = JSON.parse(resendCall![1].body)
    expect(body).toMatchObject({
      from: 'Org <noreply@prezva.app>',
      to: 'sam@example.com',
      subject: 'Subject',
      html: '<p>hi</p>',
      text: 'hi',
      reply_to: 'org@example.com',
    })

    const urls = fetchMock.mock.calls.map((c: any[]) => c[0])
    expect(urls.some((u: string) => u.includes('/contacts/upsert'))).toBe(false)
    expect(urls.some((u: string) => u.includes('/conversations/messages'))).toBe(false)
  })

  it('(d) GHL send failure rejects (no Resend fallback)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/contacts/upsert')) {
        return { ok: true, json: async () => ({ contact: { id: 'contact_xyz' } }) }
      }
      if (url.includes('/conversations/messages')) {
        return { ok: false, status: 500, text: async () => 'ghl boom' }
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const admin = createFakeAdmin({ locationId: 'loc_123', updateSpy: vi.fn() })

    await expect(
      sendSpeakerEmail({
        admin,
        orgId: 'org_1',
        speaker: { id: 'sp_1', name: 'Jane Doe', email: 'jane@example.com', ghlContactId: null },
        subject: 'Subject',
        html: '<p>hi</p>',
        resend: { from: 'Prezva Events <noreply@prezva.app>' },
      }),
    ).rejects.toThrow()

    const urls = fetchMock.mock.calls.map((c: any[]) => c[0])
    expect(urls.some((u: string) => u.includes('api.resend.com'))).toBe(false)
  })

  it('(e) Resend failure rejects', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('api.resend.com')) {
        return { ok: false, status: 422, text: async () => 'resend boom' }
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const admin = createFakeAdmin({ locationId: null, updateSpy: vi.fn() })

    await expect(
      sendSpeakerEmail({
        admin,
        orgId: 'org_2',
        speaker: { id: 'sp_2', name: 'Sam Lee', email: 'sam@example.com' },
        subject: 'Subject',
        html: '<p>hi</p>',
        resend: { from: 'Org <noreply@prezva.app>' },
      }),
    ).rejects.toThrow()
  })
})

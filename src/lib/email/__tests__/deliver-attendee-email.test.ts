import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/integrations/ghl/location', () => ({
  isEventGhlLinked: vi.fn(),
}))
vi.mock('@/lib/integrations/ghl/adapter', () => ({
  ghlAdapter: { getAccessToken: vi.fn() },
}))
vi.mock('@/lib/integrations/ghl/client', () => ({
  ghlUpsertContact: vi.fn(),
  ghlSendEmail: vi.fn(),
}))
vi.mock('@/lib/email/suppression', () => ({
  isEmailSuppressed: vi.fn(),
}))

import { deliverAttendeeEmail } from '../deliver-attendee-email'
import { isEventGhlLinked } from '@/lib/integrations/ghl/location'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { ghlUpsertContact, ghlSendEmail } from '@/lib/integrations/ghl/client'
import { isEmailSuppressed } from '@/lib/email/suppression'

type SyncRow = { ghl_contact_id: string | null } | null

function makeAdmin(cfg: { eventId: string | null; syncRow?: SyncRow }) {
  const updateCalls: any[] = []
  const admin = {
    from: vi.fn((table: string) => {
      if (table === 'registrations') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: cfg.eventId ? { event_id: cfg.eventId } : null,
            error: null,
          }),
        }
      }
      if (table === 'ghl_sync_state') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: cfg.syncRow ?? null, error: null }),
          update: vi.fn((payload: any) => {
            updateCalls.push(payload)
            return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
          }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    }),
  }
  return { admin, updateCalls }
}

const BASE_PARAMS = {
  registrationId: 'reg-1',
  to: 'attendee@example.com',
  attendeeName: 'Jane Doe',
  subject: 'Your certificate is ready',
  html: '<p>hi</p>',
  text: 'hi',
  from: 'Prezva <noreply@prezva.app>',
  replyTo: 'org@example.com',
}

describe('deliverAttendeeEmail', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-resend-key'
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ id: 'email-1' }) })
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(isEventGhlLinked).mockReset()
    vi.mocked(ghlAdapter.getAccessToken).mockReset().mockResolvedValue('test-token')
    vi.mocked(ghlUpsertContact).mockReset().mockResolvedValue('contact-new')
    vi.mocked(ghlSendEmail).mockReset().mockResolvedValue({ messageId: 'm1', conversationId: 'c1' })
    vi.mocked(isEmailSuppressed).mockReset().mockResolvedValue(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('not-linked event sends via Resend, never touches GHL', async () => {
    vi.mocked(isEventGhlLinked).mockResolvedValue({ linked: false, orgId: null, locationId: null })
    const { admin } = makeAdmin({ eventId: 'event-1' })

    const result = await deliverAttendeeEmail(admin as any, BASE_PARAMS)

    expect(result).toEqual({ channel: 'resend' })
    expect(ghlSendEmail).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('linked event with an existing ghl_contact_id sends via GHL, never touches Resend', async () => {
    vi.mocked(isEventGhlLinked).mockResolvedValue({ linked: true, orgId: 'org-1', locationId: 'loc-1' })
    const { admin } = makeAdmin({ eventId: 'event-1', syncRow: { ghl_contact_id: 'contact-existing' } })

    const result = await deliverAttendeeEmail(admin as any, BASE_PARAMS)

    expect(result).toEqual({ channel: 'ghl' })
    expect(ghlSendEmail).toHaveBeenCalledWith('test-token', {
      contactId: 'contact-existing',
      subject: BASE_PARAMS.subject,
      html: BASE_PARAMS.html,
    })
    expect(ghlUpsertContact).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('linked event with no ghl_contact_id upserts a contact, writes it back, then sends via GHL', async () => {
    vi.mocked(isEventGhlLinked).mockResolvedValue({ linked: true, orgId: 'org-1', locationId: 'loc-1' })
    const { admin, updateCalls } = makeAdmin({ eventId: 'event-1', syncRow: { ghl_contact_id: null } })

    const result = await deliverAttendeeEmail(admin as any, BASE_PARAMS)

    expect(result).toEqual({ channel: 'ghl' })
    expect(ghlUpsertContact).toHaveBeenCalledWith('test-token', {
      firstName: 'Jane',
      lastName: 'Doe',
      email: BASE_PARAMS.to,
      locationId: 'loc-1',
    })
    expect(ghlSendEmail).toHaveBeenCalledWith('test-token', {
      contactId: 'contact-new',
      subject: BASE_PARAMS.subject,
      html: BASE_PARAMS.html,
    })
    expect(updateCalls).toEqual([{ ghl_contact_id: 'contact-new' }])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to Resend when the GHL send throws, and surfaces ghlError', async () => {
    vi.mocked(isEventGhlLinked).mockResolvedValue({ linked: true, orgId: 'org-1', locationId: 'loc-1' })
    vi.mocked(ghlSendEmail).mockRejectedValueOnce(new Error('GHL send email failed: 500 — boom'))
    const { admin } = makeAdmin({ eventId: 'event-1', syncRow: { ghl_contact_id: 'contact-existing' } })

    const result = await deliverAttendeeEmail(admin as any, BASE_PARAMS)

    expect(result.channel).toBe('resend')
    expect(result.ghlError).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('Resend branch skips the send for a suppressed address — no GHL, no Resend call, no throw', async () => {
    vi.mocked(isEventGhlLinked).mockResolvedValue({ linked: false, orgId: null, locationId: null })
    vi.mocked(isEmailSuppressed).mockResolvedValue(true)
    const { admin } = makeAdmin({ eventId: 'event-1' })

    const result = await deliverAttendeeEmail(admin as any, BASE_PARAMS)

    expect(result).toEqual({ channel: 'resend', suppressed: true })
    expect(ghlSendEmail).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@trigger.dev/sdk', () => ({ schemaTask: (opts: any) => opts }))

import { sendVolunteerInviteEmail } from '../volunteer-invite'

type Payload = Parameters<typeof sendVolunteerInviteEmail.trigger>[0]
const run = (p: Payload) => (sendVolunteerInviteEmail as unknown as { run: (p: Payload) => Promise<unknown> }).run(p)

afterEach(() => vi.unstubAllGlobals())

describe('volunteer invite email (O109)', () => {
  it('shows the shift in the event zone and names it', async () => {
    process.env.RESEND_API_KEY = 'test'
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await run({
      volunteerName: 'Val', volunteerEmail: 'v@x.io', volunteerRole: 'general', eventTitle: 'Expo',
      eventDate: '2026-10-06T13:00:00Z', shiftStart: '2026-10-06T13:00:00Z', shiftEnd: '2026-10-06T21:00:00Z',
      eventTimezone: 'America/New_York', portalUrl: 'https://prezva.app/volunteer/t',
    })
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.html).toContain('Oct 6, 2026, 9:00 AM – 5:00 PM Eastern Time')
    expect(body.text).toContain('Shift: Oct 6, 2026, 9:00 AM – 5:00 PM Eastern Time')
  })
})

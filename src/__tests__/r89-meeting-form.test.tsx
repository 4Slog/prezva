// R89: the requester proposes a time in their DEVICE's zone by default, with a
// zone dropdown beside it; the request carries { at, tz }.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.hoisted(() => { process.env.TZ = 'America/Los_Angeles' })

const sendMeetingRequest = vi.fn(async (..._a: unknown[]) => ({ success: true }))
vi.mock('@/lib/networking/sprint8-actions', () => ({
  followAttendee: vi.fn(), unfollowAttendee: vi.fn(),
  sendMeetingRequest: (...a: unknown[]) => sendMeetingRequest(...a),
}))
vi.mock('@/lib/video/actions', () => ({ createOneOnOneRoom: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import { ProfileActions } from '@/app/e/[slug]/people/[registrationId]/profile-actions'

const RECIPIENT = '00000000-0000-4000-8000-0000000000aa'

function open() {
  render(<ProfileActions eventId="e1" eventSlug="ev" targetUserId={RECIPIENT} targetName="Ann" registrationId="r1" isFollowing={false} />)
  fireEvent.click(screen.getByText('Request meeting'))
}

beforeEach(() => sendMeetingRequest.mockClear())

describe('R89 meeting request form', () => {
  it('defaults the zone to the device zone and sends the instant with that zone', async () => {
    open()
    const zone = screen.getByLabelText('Time zone') as HTMLSelectElement
    expect(zone.value).toBe('America/Los_Angeles')
    fireEvent.change(screen.getByLabelText(/Proposed time/), { target: { value: '2026-10-06T12:00' } })
    await act(async () => { fireEvent.click(screen.getByText('Send request')) })
    expect(sendMeetingRequest).toHaveBeenCalledWith('e1', expect.objectContaining({
      proposed_times: [{ at: '2026-10-06T19:00:00.000Z', tz: 'America/Los_Angeles' }],
    }))
  })

  it('a zone picked from the dropdown is used instead', async () => {
    open()
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'America/New_York' } })
    fireEvent.change(screen.getByLabelText(/Proposed time/), { target: { value: '2026-10-06T15:00' } })
    await act(async () => { fireEvent.click(screen.getByText('Send request')) })
    expect(sendMeetingRequest).toHaveBeenCalledWith('e1', expect.objectContaining({
      proposed_times: [{ at: '2026-10-06T19:00:00.000Z', tz: 'America/New_York' }],
    }))
  })
})

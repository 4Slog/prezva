// Batch C commit 4 (O134): the counter form uses the R89 zoned picker and
// surfaces errors; the requester sees the counter in its zone plus local time.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.hoisted(() => { process.env.TZ = 'America/Los_Angeles' })

const respondToMeetingRequest = vi.fn()
const respondToCounterProposal = vi.fn()
vi.mock('@/lib/networking/sprint8-actions', () => ({
  respondToMeetingRequest: (...a: unknown[]) => respondToMeetingRequest(...a),
  respondToCounterProposal: (...a: unknown[]) => respondToCounterProposal(...a),
}))

import { MeetingResponsePanel } from '@/components/networking/MeetingResponsePanel'
import { MeetingCounterPanel } from '@/components/networking/MeetingCounterPanel'

beforeEach(() => { respondToMeetingRequest.mockReset(); respondToCounterProposal.mockReset() })

const panel = () => render(
  <MeetingResponsePanel requestId="m1" requesterName="Ann" requesterAvatarUrl={null} requesterHandle={null}
    message={null} proposedTimes={[]} initialStatus="pending" />,
)

describe('MeetingResponsePanel counter', () => {
  it('defaults to the device zone and sends { at, tz }', async () => {
    respondToMeetingRequest.mockResolvedValue({ ok: true, status: 'countered' })
    panel()
    fireEvent.click(screen.getByText(/Suggest time/))
    await waitFor(() => expect((screen.getByLabelText('Time zone') as HTMLSelectElement).value).toBe('America/Los_Angeles'))
    fireEvent.change(screen.getByLabelText('Suggested time'), { target: { value: '2026-10-06T12:00' } })
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'America/New_York' } })
    fireEvent.click(screen.getByText('Send counter'))
    await waitFor(() => expect(screen.getByText('Counter-proposal sent')).toBeTruthy())
    expect(respondToMeetingRequest).toHaveBeenCalledWith('m1', 'counter', { at: '2026-10-06T16:00:00.000Z', tz: 'America/New_York' }, '')
  })

  it('shows the returned error instead of success', async () => {
    respondToMeetingRequest.mockResolvedValue({ error: 'This meeting request is no longer open' })
    panel()
    fireEvent.click(screen.getByText(/Accept/))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('no longer open'))
    expect(screen.queryByText(/Accepted ✓/)).toBeNull()
  })
})

describe('MeetingCounterPanel (requester)', () => {
  const counter = { at: '2026-10-06T16:00:00.000Z', tz: 'America/New_York' }

  it('names the proposed zone and the viewer\'s local time', async () => {
    render(<MeetingCounterPanel requestId="m1" recipientName="Bob" counterTime={counter} counterNote="at the lounge" />)
    await waitFor(() => expect(screen.getByText(/your time/)).toBeTruthy())
    const text = screen.getByText(/your time/).textContent!
    expect(text).toContain('12:00 PM Eastern')
    expect(text).toContain('9:00 AM your time (Pacific)')
    expect(screen.getByText('at the lounge')).toBeTruthy()
  })

  it('accept and decline call the action and show the outcome; errors are shown', async () => {
    respondToCounterProposal.mockResolvedValueOnce({ error: 'This counter-proposal is no longer open' })
    render(<MeetingCounterPanel requestId="m1" recipientName="Bob" counterTime={counter} counterNote={null} />)
    fireEvent.click(screen.getByText(/Accept/))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    respondToCounterProposal.mockResolvedValueOnce({ ok: true, status: 'declined' })
    fireEvent.click(screen.getByText(/Decline/))
    await waitFor(() => expect(screen.getByText('Counter-proposal declined')).toBeTruthy())
    expect(respondToCounterProposal).toHaveBeenLastCalledWith('m1', 'declined')
  })
})

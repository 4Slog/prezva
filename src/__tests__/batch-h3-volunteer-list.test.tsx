// Batch H3 (O168, found in review): after a successful resend the dashboard
// list shows a reset (declined → invited) volunteer as the server now has them.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'

vi.mock('@/lib/volunteers/actions', () => ({ resolveVolunteerAlert: vi.fn(), exportVolunteerHours: vi.fn() }))

import { VolunteersClient } from '@/app/(dashboard)/events/[slug]/volunteers/volunteers-client'

const base = { name: 'Val', email: 'val@x.com', role: 'check-in', portal_access_token: 't' }

describe('volunteers list after Resend', () => {
  it('a declined volunteer shows as invited with a pending response; a confirmed one is unchanged', async () => {
    const resend = vi.fn(async () => ({ ok: true as const }))
    render(
      <VolunteersClient eventId="e1" eventSlug="conf" eventTimezone="UTC" sessions={[]} alerts={[]} permissions={['*']}
        volunteers={[
          { id: 'v1', ...base, status: 'declined', shift_response: 'declined' },
          { id: 'v2', ...base, name: 'Cal', email: 'cal@x.com', status: 'confirmed', shift_response: 'confirmed' },
        ]}
        resendAction={resend} />,
    )
    const rowOf = (name: string) => screen.getByText(name).closest('tr')!
    await act(async () => { fireEvent.click(within(rowOf('Val')).getByText('Resend')) })
    await act(async () => { fireEvent.click(within(rowOf('Cal')).getByText('Resend')) })
    expect(resend).toHaveBeenCalledTimes(2)
    expect(within(rowOf('Val')).getByText('invited')).toBeInTheDocument()
    expect(within(rowOf('Val')).queryByText(/declined/i)).not.toBeInTheDocument()
    expect(within(rowOf('Cal')).getAllByText('confirmed').length).toBeGreaterThan(0)
    expect(within(rowOf('Cal')).queryByText('invited')).not.toBeInTheDocument()
  })
})

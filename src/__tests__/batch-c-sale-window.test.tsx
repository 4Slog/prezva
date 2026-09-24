// Batch C commit 6 (O136): ticket sale windows read in the EVENT's zone, on
// the dashboard TicketManager and the embedded event card.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.hoisted(() => { process.env.TZ = 'America/Los_Angeles' })
vi.mock('@/lib/registration/ticket-actions', () => ({ createTicketType: vi.fn(), deleteTicketType: vi.fn() }))
vi.mock('@/app/embedded/_components/ghl-product-picker', () => ({ GhlProductPicker: () => null }))

import { formatSaleWindow } from '@/lib/datetime/sale-window'
import { TicketManager } from '@/components/registration/TicketManager'
import { EmbeddedEventCard } from '@/app/embedded/_components/embedded-event-card'

const NY = 'America/New_York'
const NOW = Date.parse('2026-10-01T12:00:00Z')
const PAST = '2026-09-28T13:00:00Z'     // Sep 28, 9:00 AM Eastern
const SOON = '2026-10-06T13:00:00Z'     // Oct 6, 9:00 AM Eastern
const LATER = '2026-10-10T21:00:00Z'    // Oct 10, 5:00 PM Eastern
const GONE = '2026-09-30T21:00:00Z'     // Sep 30, 5:00 PM Eastern

describe('formatSaleWindow', () => {
  it('always: no window, nothing to show', () => {
    expect(formatSaleWindow(null, null, NY, NOW)).toEqual({ state: 'always', label: null })
  })

  it('upcoming: opens later, in the event zone', () => {
    expect(formatSaleWindow(SOON, null, NY, NOW)).toEqual({ state: 'upcoming', label: 'Sales open Oct 6, 9:00 AM Eastern Time' })
    expect(formatSaleWindow(SOON, LATER, NY, NOW)).toEqual({ state: 'upcoming', label: 'Sales open Oct 6, 9:00 AM – Oct 10, 5:00 PM Eastern' })
  })

  it('open_until: on sale with an end', () => {
    expect(formatSaleWindow(PAST, LATER, NY, NOW)).toEqual({ state: 'open_until', label: 'On sale until Oct 10, 5:00 PM Eastern Time' })
    expect(formatSaleWindow(null, LATER, NY, NOW).state).toBe('open_until')
  })

  it('open: started, no end', () => {
    expect(formatSaleWindow(PAST, null, NY, NOW)).toEqual({ state: 'open', label: 'On sale since Sep 28, 9:00 AM Eastern Time' })
  })

  it('ended: the end has passed', () => {
    expect(formatSaleWindow(PAST, GONE, NY, NOW)).toEqual({ state: 'ended', label: 'Sales ended Sep 30, 5:00 PM Eastern Time' })
  })

  it('reads in the event zone, not the viewer\'s (viewer is Pacific here)', () => {
    expect(formatSaleWindow(SOON, null, 'Europe/London', NOW).label).toBe('Sales open Oct 6, 2:00 PM United Kingdom Time')
  })
})

const ticket = (over: Record<string, unknown>) => ({
  id: 't1', name: 'GA', description: null, type: 'paid', price_cents: 1000, currency: 'usd',
  quantity: null, quantity_sold: 0, is_visible: true, sort_order: 0, event_id: 'e1', ...over,
})

describe('displays', () => {
  it('TicketManager shows the window in the event zone', () => {
    render(<TicketManager eventId="e1" eventTimezone={NY} tickets={[ticket({ sale_starts_at: '2099-10-06T13:00:00Z', sale_ends_at: null })] as any} />)
    expect(screen.getByText('Sales open Oct 6, 9:00 AM Eastern Time')).toBeInTheDocument()
  })

  it('the embedded event card shows it too', () => {
    render(
      <EmbeddedEventCard
        entitled
        event={{ id: 'e1', title: 'Summit', slug: 's', start_at: '2099-10-06T13:00:00Z', status: 'published', event_type: null, venue_name: null, venue_city: null, venue_state: null, capacity: null, registration_count: 0, timezone: NY }}
        tickets={[ticket({ sale_starts_at: '2020-01-01T00:00:00Z', sale_ends_at: '2020-02-01T22:00:00Z' }) as any]}
      />,
    )
    expect(screen.getByText('Sales ended Feb 1, 5:00 PM Eastern Time')).toBeInTheDocument()
  })
})

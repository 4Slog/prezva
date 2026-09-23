import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EventSettingsForm } from './settings-form'
import { embedUpdateEvent } from '@/lib/embedded/event-actions'

vi.mock('@/lib/embedded/event-actions', () => ({ embedUpdateEvent: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const EVENT = {
  id: 'evt-1', title: 'Summit', description: null, event_type: 'in_person',
  timezone: 'America/Phoenix',
  start_at: '2026-09-23T19:00:00+00:00', end_at: '2026-09-23T21:00:00+00:00',
  venue_name: null, venue_address: null, venue_city: null, venue_state: null, virtual_url: null,
}

beforeEach(() => vi.mocked(embedUpdateEvent).mockReset())

describe('embedded EventSettingsForm', () => {
  it("displays start/end in the event's own zone (Phoenix is UTC-7), not UTC", () => {
    const { container } = render(<EventSettingsForm eventId="evt-1" event={EVENT} />)
    expect((container.querySelector('input[name="start_at"]') as HTMLInputElement).value).toBe('2026-09-23T12:00')
    expect((container.querySelector('input[name="end_at"]') as HTMLInputElement).value).toBe('2026-09-23T14:00')
  })

  it('keeps a non-listed timezone selected', () => {
    const { container } = render(<EventSettingsForm eventId="evt-1" event={EVENT} />)
    expect((container.querySelector('select[name="timezone"]') as HTMLSelectElement).value).toBe('America/Phoenix')
  })

  it('surfaces a save error', async () => {
    vi.mocked(embedUpdateEvent).mockResolvedValue({ error: 'End time must be after start time' })
    const { container } = render(<EventSettingsForm eventId="evt-1" event={EVENT} />)
    fireEvent.submit(container.querySelector('form')!)
    expect(await screen.findByText('End time must be after start time')).toBeInTheDocument()
  })
})

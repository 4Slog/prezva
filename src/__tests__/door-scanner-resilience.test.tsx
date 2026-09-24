import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// R84 — both door clients: a thrown server call queues the scan and shows
// "Queued — will sync" (never an attendee name), a returned refusal shows as a
// refusal, and the scanner always resets afterwards.

vi.mock('@/components/checkin/QRScanner', () => ({
  QRScanner: ({ onScan }: { onScan: (code: string) => void }) => (
    <button onClick={() => onScan('PREZVA-SCAN')}>scan</button>
  ),
}))
vi.mock('@/components/checkin/ManualSearch', () => ({ ManualSearch: () => null }))
vi.mock('@/components/checkin/CheckInDashboard', () => ({ CheckInDashboard: () => null }))
vi.mock('@/app/e/[slug]/my-qr/qr-display', () => ({ default: () => null }))

const dash = vi.hoisted(() => ({
  checkInByQR: vi.fn(),
  checkInBySearch: vi.fn(),
  getCheckInStats: vi.fn(),
}))
vi.mock('@/lib/checkin/actions', () => dash)
const embed = vi.hoisted(() => ({
  checkInByQR: vi.fn(),
  checkInBySearch: vi.fn(),
  getCheckInStats: vi.fn(),
  searchAttendeesForCheckIn: vi.fn(),
}))
vi.mock('@/lib/embedded/checkin-actions', () => embed)

import { CheckInClient } from '@/app/(dashboard)/events/[slug]/checkin/client'
import { EmbedCheckInClient } from '@/app/embedded/events/[eventId]/checkin/client'
import { getOfflineDB, getPendingCount } from '@/lib/checkin/offline-db'

const EVENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const STATS = { total_registered: 10, total_checked_in: 0, percent: 0, recent: [] }

const clients = [
  {
    name: 'dashboard',
    actions: dash,
    renderIt: () => render(<CheckInClient eventId={EVENT_ID} eventName="Door" initialStats={STATS} permissions={['*']} />),
  },
  {
    name: 'embedded',
    actions: embed,
    renderIt: () => render(<EmbedCheckInClient eventId={EVENT_ID} eventName="Door" initialStats={STATS} arrivalUrl="https://x" />),
  },
] as const

beforeEach(async () => {
  await getOfflineDB().pending.clear()
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each(clients)('$name door client — scanner resilience', ({ actions, renderIt }) => {
  beforeEach(() => {
    actions.checkInByQR.mockReset()
    actions.getCheckInStats.mockReset().mockResolvedValue(STATS)
  })

  it('a thrown server call queues the scan, shows "Queued — will sync", and the scanner resets', async () => {
    actions.checkInByQR.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderIt()
    fireEvent.click(screen.getByText('scan'))

    expect(await screen.findByText('Queued — will sync')).toBeInTheDocument()
    expect(screen.queryByText(/checked in —/)).not.toBeInTheDocument()
    expect(await getPendingCount(EVENT_ID)).toBe(1)
    const [row] = await getOfflineDB().pending.toArray()
    expect(row).toMatchObject({ qrCode: 'prezva-scan', status: 'pending' })

    // The scanner is not frozen: after the reset a second scan reaches the server.
    await waitFor(() => expect(screen.queryByText('Queued — will sync')).not.toBeInTheDocument(), { timeout: 4500 })
    actions.checkInByQR.mockResolvedValueOnce({ success: false, error: 'Registration is cancelled' })
    fireEvent.click(screen.getByText('scan'))
    expect(await screen.findByText('Registration is cancelled')).toBeInTheDocument()
    expect(actions.checkInByQR).toHaveBeenCalledTimes(2)
  }, 10_000)

  it('a returned { success: false } is a refusal and is not queued', async () => {
    actions.checkInByQR.mockResolvedValueOnce({ success: false, error: 'QR code not found for this event' })
    renderIt()
    fireEvent.click(screen.getByText('scan'))
    expect(await screen.findByText('QR code not found for this event')).toBeInTheDocument()
    expect(screen.queryByText('Queued — will sync')).not.toBeInTheDocument()
    expect(await getPendingCount(EVENT_ID)).toBe(0)
  })

  it('offline, the scan is queued without calling the server', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      renderIt()
      fireEvent.click(screen.getByText('scan'))
      expect(await screen.findByText('Queued — will sync')).toBeInTheDocument()
      expect(actions.checkInByQR).not.toHaveBeenCalled()
      expect(await getPendingCount(EVENT_ID)).toBe(1)
    } finally {
      spy.mockRestore()
    }
  })
})

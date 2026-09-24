import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

// Batch C commit 5 (O135): all three scanners share useScanResult.
// Refusals stay until "Next guest"; camera frames are ignored while one is up;
// a manual search or typed code replaces it; successes clear after 3 s; the
// same code read by the camera within 3 s of a success is ignored. R81
// override and R85 re-check stay available on their refusals.

const scanner = vi.hoisted(() => ({ code: 'PREZVA-A' }))
vi.mock('@/components/checkin/QRScanner', () => ({
  QRScanner: ({ onScan }: { onScan: (code: string, source: 'camera' | 'typed') => void }) => (
    <>
      <button onClick={() => onScan(scanner.code, 'camera')}>camera</button>
      <button onClick={() => onScan(scanner.code, 'typed')}>typed</button>
    </>
  ),
}))
vi.mock('@/components/checkin/ManualSearch', () => ({
  ManualSearch: ({ onCheckIn }: { onCheckIn: (id: string) => void }) => (
    <button onClick={() => onCheckIn('reg-manual')}>manual check-in</button>
  ),
}))
vi.mock('@/components/checkin/CheckInDashboard', () => ({ CheckInDashboard: () => null }))
vi.mock('@/app/e/[slug]/my-qr/qr-display', () => ({ default: () => null }))

const dash = vi.hoisted(() => ({ checkInByQR: vi.fn(), checkInBySearch: vi.fn(), getCheckInStats: vi.fn() }))
vi.mock('@/lib/checkin/actions', () => dash)
const embed = vi.hoisted(() => ({ checkInByQR: vi.fn(), checkInBySearch: vi.fn(), getCheckInStats: vi.fn(), searchAttendeesForCheckIn: vi.fn() }))
vi.mock('@/lib/embedded/checkin-actions', () => embed)

import { CheckInClient } from '@/app/(dashboard)/events/[slug]/checkin/client'
import { EmbedCheckInClient } from '@/app/embedded/events/[eventId]/checkin/client'
import { SessionCheckInScanner } from '@/components/checkin/SessionCheckInScanner'
import { openScanDb, scanDbName, savePack } from '@/lib/checkin/session-offline-db'

const EVENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const STATS = { total_registered: 10, total_checked_in: 0, percent: 0, recent: [] }
const OK = (name: string) => ({ success: true, registration: { id: `id-${name}`, attendee_name: name, ticket_name: 'GA', already_checked_in: false } })
const ERR = { success: false, error: 'Registration not found' }

const tick = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
const click = async (label: string | RegExp) => { fireEvent.click(screen.getByText(label)); await tick() }

beforeEach(() => {
  // setTimeout/Date only: Dexie (fake-indexeddb) needs real setImmediate/microtasks.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  scanner.code = 'PREZVA-A'
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const doors = [
  { name: 'dashboard door', actions: dash, renderIt: () => render(<CheckInClient eventId={EVENT_ID} eventName="Door" initialStats={STATS} permissions={['*']} />) },
  { name: 'embedded door', actions: embed, renderIt: () => render(<EmbedCheckInClient eventId={EVENT_ID} eventName="Door" initialStats={STATS} arrivalUrl="https://x" />) },
] as const

describe.each(doors)('$name', ({ actions, renderIt }) => {
  beforeEach(() => {
    actions.checkInByQR.mockReset()
    actions.checkInBySearch.mockReset()
    actions.getCheckInStats.mockReset().mockResolvedValue(STATS)
  })

  it('a refusal stays up past 3 s and camera frames are ignored until Next guest', async () => {
    actions.checkInByQR.mockResolvedValue(ERR)
    renderIt()
    await click('camera')
    expect(screen.getByText('Registration not found')).toBeInTheDocument()
    await tick(10_000)
    expect(screen.getByText('Registration not found')).toBeInTheDocument()

    scanner.code = 'PREZVA-B'
    await click('camera')
    expect(actions.checkInByQR).toHaveBeenCalledTimes(1)

    await click('Next guest')
    expect(screen.queryByText('Registration not found')).not.toBeInTheDocument()
    actions.checkInByQR.mockResolvedValue(OK('Ben'))
    await click('camera')
    expect(actions.checkInByQR).toHaveBeenCalledTimes(2)
    expect(screen.getByText(/Ben checked in/)).toBeInTheDocument()
  })

  it('a "Do not admit" refusal (R90) is sticky too', async () => {
    actions.checkInByQR.mockResolvedValue({ success: false, error: 'Refused', refusal: { attendeeName: 'Ann', reason: 'Cancelled', guidance: 'Send to the desk' } })
    renderIt()
    await click('camera')
    expect(screen.getByTestId('door-refusal')).toBeInTheDocument()
    await tick(10_000)
    expect(screen.getByTestId('door-refusal')).toBeInTheDocument()
    expect(screen.getByText('Next guest')).toBeInTheDocument()
  })

  it('a typed code replaces the refusal', async () => {
    actions.checkInByQR.mockResolvedValueOnce(ERR).mockResolvedValueOnce(OK('Cat'))
    renderIt()
    await click('camera')
    scanner.code = 'PREZVA-C'
    await click('typed')
    expect(actions.checkInByQR).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Registration not found')).not.toBeInTheDocument()
    expect(screen.getByText(/Cat checked in/)).toBeInTheDocument()
  })

  it('a manual search check-in replaces the refusal', async () => {
    actions.checkInByQR.mockResolvedValue(ERR)
    actions.checkInBySearch.mockResolvedValue(OK('Dee'))
    renderIt()
    await click('camera')
    await click('Name Search')
    await click('manual check-in')
    expect(screen.queryByText('Registration not found')).not.toBeInTheDocument()
    expect(screen.getByText(/Dee checked in/)).toBeInTheDocument()
  })

  it('a success clears after 3 s; the same code is ignored for 3 s, another code is not', async () => {
    actions.checkInByQR.mockResolvedValue(OK('Eve'))
    renderIt()
    await click('camera')
    expect(screen.getByText(/Eve checked in/)).toBeInTheDocument()
    await click('camera')
    expect(actions.checkInByQR).toHaveBeenCalledTimes(1)
    scanner.code = 'PREZVA-F'
    await click('camera')
    expect(actions.checkInByQR).toHaveBeenCalledTimes(2)
    await tick(3100)
    expect(screen.queryByText(/Eve checked in/)).not.toBeInTheDocument()
    scanner.code = 'PREZVA-A'
    await click('camera')
    expect(actions.checkInByQR).toHaveBeenCalledTimes(3)
  })
})

describe('SessionCheckInScanner', () => {
  const actions = {
    scan: vi.fn(),
    mark: vi.fn(),
    override: vi.fn(),
    fetchPack: vi.fn(async () => ({ error: 'no pack' })),
  }
  const renderIt = () => render(
    <SessionCheckInScanner surface="dashboard" eventId={EVENT_ID} sessionId="s1" sessionTitle="Talk" sessionUrl="https://x"
      initialAttendees={[{ registration_id: 'r-ann', attendee_name: 'Ann', attendee_email: 'ann@x.test', ticket_name: 'GA', checked_in: false }]}
      staffKey="user-1" actions={actions} />,
  )
  beforeEach(() => { actions.scan.mockReset(); actions.mark.mockReset(); actions.override.mockReset() })

  it('an error stays until Next guest and blocks the camera', async () => {
    actions.scan.mockResolvedValue(ERR)
    renderIt()
    await click('camera')
    await tick(10_000)
    expect(screen.getByText('Registration not found')).toBeInTheDocument()
    await click('camera')
    expect(actions.scan).toHaveBeenCalledTimes(1)
    await click('Next guest')
    expect(screen.queryByText('Registration not found')).not.toBeInTheDocument()
  })

  it('R81: a refused GHL ticket keeps Override… beside Next guest', async () => {
    actions.scan.mockResolvedValue({ success: false, error: 'Ticket not valid for this session', canOverride: true })
    renderIt()
    await click('camera')
    expect(screen.getByText('Override…')).toBeInTheDocument()
    expect(screen.getByText('Next guest')).toBeInTheDocument()
    await click('Override…')
    expect(screen.getByText(/tap the attendee/)).toBeInTheDocument()
  })

  it('a manual mark replaces the refusal', async () => {
    actions.scan.mockResolvedValue(ERR)
    actions.mark.mockResolvedValue(OK('Ann'))
    renderIt()
    await click('camera')
    await click(/^Attendees/)
    await click('Mark in')
    expect(screen.queryByText('Registration not found')).not.toBeInTheDocument()
    expect(screen.getByText(/Ann checked in/)).toBeInTheDocument()
  })

  it('a success clears after 3 s and the same code is ignored meanwhile', async () => {
    actions.scan.mockResolvedValue(OK('Ann'))
    renderIt()
    await click('camera')
    await click('camera')
    expect(actions.scan).toHaveBeenCalledTimes(1)
    await tick(3100)
    expect(screen.queryByText(/Ann checked in/)).not.toBeInTheDocument()
  })

  it('R85: offline "not on this device\'s list" stays with re-check, Override and Next guest', async () => {
    const db = openScanDb(await scanDbName('dashboard', 'user-1', EVENT_ID))
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    await savePack(db, 's1', {
      serverNow: new Date().toISOString(),
      grant: `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`,
      eventEndsAt: new Date(Date.now() + 3600_000).toISOString(),
      attendees: [],
    })
    actions.scan.mockRejectedValue(new TypeError('Failed to fetch'))
    renderIt()
    scanner.code = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'
    await tick(50)
    await click('camera')
    for (let i = 0; i < 20 && !screen.queryByText(/Not on this device/); i++) await tick(10)
    expect(screen.getByText(/Not on this device/)).toBeInTheDocument()
    expect(screen.getByText('Queue for re-check')).toBeInTheDocument()
    expect(screen.getByText('Override…')).toBeInTheDocument()
    // Before O135 this cleared after 4 s.
    await tick(10_000)
    expect(screen.getByText(/Not on this device/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('camera'))
    expect(actions.scan).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Next guest'))
    expect(screen.queryByText(/Not on this device/)).not.toBeInTheDocument()
  }, 10_000)
})

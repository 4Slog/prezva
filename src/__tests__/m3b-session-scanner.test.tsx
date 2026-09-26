import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { createHash } from 'node:crypto'

// M3b-B — both session scanners offline: device-list outcomes, re-check only on
// the button, manual / override queueing, thrown-call fallback with no freeze,
// the session-expired banner per surface, pack staleness / expiry, beforeunload;
// plus sign-out clearing and the door manual-search guard.

let nextScan = ''
vi.mock('@/components/checkin/QRScanner', () => ({
  QRScanner: ({ onScan }: { onScan: (code: string) => void }) => (
    <button onClick={() => onScan(nextScan)}>scan</button>
  ),
}))
vi.mock('@/components/checkin/ManualSearch', () => ({
  ManualSearch: ({ onCheckIn }: { onCheckIn: (id: string) => void }) => (
    <button onClick={() => onCheckIn('11111111-1111-4111-8111-111111111111')}>manual check-in</button>
  ),
}))
vi.mock('@/components/checkin/CheckInDashboard', () => ({ CheckInDashboard: () => null }))
vi.mock('@/app/e/[slug]/my-qr/qr-display', () => ({ default: () => null }))

const dash = vi.hoisted(() => ({
  orgCheckInToSession: vi.fn(),
  orgOverrideSessionCheckIn: vi.fn(),
  getOfflineSessionPack: vi.fn(),
  checkInByQR: vi.fn(),
  checkInBySearch: vi.fn(),
  getCheckInStats: vi.fn(),
}))
vi.mock('@/lib/checkin/actions', () => dash)
const embed = vi.hoisted(() => ({
  embedScanIntoSession: vi.fn(),
  embedManualMarkSession: vi.fn(),
  embedOverrideSessionCheckIn: vi.fn(),
  embedGetOfflineSessionPack: vi.fn(),
  checkInByQR: vi.fn(),
  checkInBySearch: vi.fn(),
  getCheckInStats: vi.fn(),
  searchAttendeesForCheckIn: vi.fn(),
}))
vi.mock('@/lib/embedded/checkin-actions', () => embed)
const auth = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('@/lib/auth/actions', () => auth)

import DashSessionClient from '@/app/(dashboard)/events/[slug]/sessions/[sessionId]/checkin/client'
import EmbedSessionClient from '@/app/embedded/events/[eventId]/sessions/[sessionId]/checkin/client'
import { CheckInClient } from '@/app/(dashboard)/events/[slug]/checkin/client'
import { EmbedCheckInClient } from '@/app/embedded/events/[eventId]/checkin/client'
import { UserMenu } from '@/components/auth/UserMenu'
import { MANUAL_CHECKIN_FAILED } from '@/components/checkin/OfflineQueuePanel'
import {
  scanDbName,
  openScanDb,
  savePack,
  enqueue,
  deleteAllScanDbs,
  listScanDbNames,
  PACK_TOO_OLD_MESSAGE,
  OFFLINE_UNAVAILABLE_MESSAGE,
  PACK_MAX_AGE_MS,
  type SessionScanDB,
} from '@/lib/checkin/session-offline-db'
import type { OfflineSessionPack } from '@/lib/checkin/offline-pack'

const EVENT = 'e1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const SESSION = '5e551000-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const ADA = '11111111-1111-4111-8111-111111111111'
const BOB = '11111111-1111-4111-8111-222222222222'
const QR_ADA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const GHL_BOB = 'abcdefabcdefabcdefabcdef'
const ghlToken = (id: string) => `v1.${id}.${'A'.repeat(43)}`
const sha = (v: string) => createHash('sha256').update(v.toLowerCase()).digest('hex')
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const grantExp = (ms: number) => `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor(ms / 1000) })}.sig`

function makePack(over: Partial<OfflineSessionPack> = {}): OfflineSessionPack {
  return {
    serverNow: new Date().toISOString(),
    grant: grantExp(Date.now() + 3600_000),
    eventEndsAt: new Date(Date.now() + 3600_000).toISOString(),
    attendees: [
      { registrationId: ADA, name: 'Ada Lovelace', email: 'ada@test.com', ticketName: 'General', ghlIdHash: null, qrHash: sha(QR_ADA), checkedInAt: null },
      { registrationId: BOB, name: 'Bob Byron', email: 'bob@test.com', ticketName: 'VIP', ghlIdHash: sha(GHL_BOB), qrHash: null, checkedInAt: null },
    ],
    ...over,
  }
}

const initialAttendees = [
  { registration_id: ADA, attendee_name: 'Ada Lovelace', attendee_email: 'ada@test.com', ticket_name: 'General', checked_in: false },
  { registration_id: BOB, attendee_name: 'Bob Byron', attendee_email: 'bob@test.com', ticket_name: 'VIP', checked_in: false },
]

let online = true
const setOnline = (v: boolean) => { online = v }

const surfaces = [
  {
    name: 'dashboard',
    surface: 'dashboard' as const,
    staffKey: 'user-1',
    scan: dash.orgCheckInToSession,
    mark: dash.orgCheckInToSession,
    override: dash.orgOverrideSessionCheckIn,
    fetchPack: dash.getOfflineSessionPack,
    expiredText: 'Signed out — sign in again to sync 1 queued check-in',
    renderIt: () => render(
      <DashSessionClient eventId={EVENT} sessionId={SESSION} sessionTitle="Keynote" sessionUrl="https://x"
        initialAttendees={initialAttendees} staffUserId="user-1" />),
  },
  {
    name: 'embedded',
    surface: 'embed' as const,
    staffKey: 'door@org.test',
    scan: embed.embedScanIntoSession,
    mark: embed.embedManualMarkSession,
    override: embed.embedOverrideSessionCheckIn,
    fetchPack: embed.embedGetOfflineSessionPack,
    expiredText: 'Session expired — reopen this page from GHL to sync 1 queued check-in',
    renderIt: () => render(
      <EmbedSessionClient eventId={EVENT} sessionId={SESSION} sessionTitle="Keynote" sessionUrl="https://x"
        initialAttendees={initialAttendees} staffEmail="door@org.test" />),
  },
]

beforeEach(async () => {
  await deleteAllScanDbs()
  setOnline(true)
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online })
  for (const f of [...Object.values(dash), ...Object.values(embed), auth.signOut]) f.mockReset()
  dash.getOfflineSessionPack.mockResolvedValue(makePack())
  embed.embedGetOfflineSessionPack.mockResolvedValue(makePack())
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ processed: 0, total: 0, results: [] }), { status: 200 })))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function dbFor(surface: 'dashboard' | 'embed', staffKey: string): Promise<SessionScanDB> {
  return openScanDb(await scanDbName(surface, staffKey, EVENT))
}

async function waitForPack(db: SessionScanDB) {
  await waitFor(async () => expect(await db.meta.get(SESSION)).toBeTruthy())
}

async function scan(code: string) {
  nextScan = code
  await act(async () => { fireEvent.click(screen.getByText('scan')) })
}

describe.each(surfaces)('$name session scanner — offline', (s) => {
  it('online: a scan goes to the server exactly as before and nothing is queued', async () => {
    s.scan.mockResolvedValue({ success: true, registration: { id: ADA, attendee_name: 'Ada Lovelace', attendee_email: '', ticket_name: '', already_checked_in: false } })
    s.renderIt()
    const db = await dbFor(s.surface, s.staffKey)
    await waitForPack(db)
    await scan(QR_ADA)
    expect(await screen.findByText(/Ada Lovelace checked in/)).toBeTruthy()
    expect(screen.queryByTestId('offline-toast')).toBeNull()
    expect(await db.queue.count()).toBe(0)
  })

  it('online: a returned refusal is shown as today (no offline fallback)', async () => {
    s.scan.mockResolvedValue({ success: false, error: 'Registration was refunded' })
    s.renderIt()
    await waitForPack(await dbFor(s.surface, s.staffKey))
    await scan(QR_ADA)
    expect(await screen.findByText('Registration was refunded')).toBeTruthy()
    expect(screen.queryByTestId('offline-toast')).toBeNull()
  })

  it('offline: a list match is accepted (offline — will sync) and queued; a second scan is already in', async () => {
    s.renderIt()
    const db = await dbFor(s.surface, s.staffKey)
    await waitForPack(db)
    setOnline(false)
    await scan(QR_ADA.toUpperCase())
    expect(await screen.findByText('Accepted: Ada Lovelace (offline — will sync)')).toBeTruthy()
    expect(s.scan).not.toHaveBeenCalled()
    const q = await db.queue.toArray()
    expect(q).toEqual([expect.objectContaining({ kind: 'scan', token: QR_ADA.toUpperCase(), status: 'pending', sessionId: SESSION })])

    await scan(QR_ADA)
    expect(await screen.findByText('Already checked in (this device)')).toBeTruthy()
    expect(await db.queue.count()).toBe(1)
  })

  it('offline: a GHL token matches by its hashed attendee id', async () => {
    s.renderIt()
    const db = await dbFor(s.surface, s.staffKey)
    await waitForPack(db)
    setOnline(false)
    await scan(ghlToken(GHL_BOB))
    expect(await screen.findByText('Accepted: Bob Byron (offline — will sync)')).toBeTruthy()
  })

  it('offline: no match → "Not on this device\'s list"; re-check is queued only on the button', async () => {
    s.renderIt()
    const db = await dbFor(s.surface, s.staffKey)
    await waitForPack(db)
    setOnline(false)
    await scan(ghlToken('0123456789abcdef01234567'))
    expect(await screen.findByText("Not on this device's list")).toBeTruthy()
    expect(await db.queue.count()).toBe(0)
    await act(async () => { fireEvent.click(screen.getByText('Queue for re-check')) })
    expect(await screen.findByText(/Pending verification/)).toBeTruthy()
    const q = await db.queue.toArray()
    expect(q).toEqual([expect.objectContaining({ kind: 'recheck', status: 'pending' })])
    expect(screen.queryByText(/^Accepted/)).toBeNull()
    expect(await screen.findByText(/1 pending verification/)).toBeTruthy()
  })

  it('a THROWN online call falls back to the device list and the scanner resets', async () => {
    s.scan.mockRejectedValue(new TypeError('Failed to fetch'))
    s.renderIt()
    const db = await dbFor(s.surface, s.staffKey)
    await waitForPack(db)
    await scan(QR_ADA)
    expect(await screen.findByText('Accepted: Ada Lovelace (offline — will sync)')).toBeTruthy()
    // Not frozen: the next scan is handled.
    await scan(ghlToken(GHL_BOB))
    expect(await screen.findByText('Accepted: Bob Byron (offline — will sync)')).toBeTruthy()
    expect(await db.queue.count()).toBe(2)
  })

  it('O125: a thrown SERVER error is a refusal, not an offline fallback', async () => {
    s.scan.mockRejectedValue(new Error('Registration is not confirmed'))
    s.renderIt()
    const db = await dbFor(s.surface, s.staffKey)
    await waitForPack(db)
    await scan(QR_ADA)
    expect(await screen.findByText(/Registration is not confirmed/)).toBeTruthy()
    expect(screen.queryByText(/offline — will sync/)).toBeNull()
    expect(await db.queue.count()).toBe(0)
  })

  it('O125: a thrown server error on Mark in is shown, nothing queued', async () => {
    s.mark.mockRejectedValue(new Error('Session not found'))
    s.renderIt()
    const db = await dbFor(s.surface, s.staffKey)
    await waitForPack(db)
    fireEvent.click(screen.getByText(/^Attendees/))
    await act(async () => { fireEvent.click(screen.getAllByText('Mark in')[0]) })
    expect(await screen.findByText(/Session not found/)).toBeTruthy()
    expect(await db.queue.count()).toBe(0)
  })

  it('offline Mark in queues a manual check-in', async () => {
    s.renderIt()
    const db = await dbFor(s.surface, s.staffKey)
    await waitForPack(db)
    setOnline(false)
    fireEvent.click(screen.getByText(/^Attendees/))
    await act(async () => { fireEvent.click(screen.getAllByText('Mark in')[0]) })
    expect(await screen.findByText('Accepted: Ada Lovelace (offline — will sync)')).toBeTruthy()
    expect(await db.queue.toArray()).toEqual([expect.objectContaining({ kind: 'manual', registrationId: ADA })])
    expect(s.mark).not.toHaveBeenCalled()
  })

  it('offline override needs the same step as online: Override… then pick the attendee', async () => {
    s.renderIt()
    const db = await dbFor(s.surface, s.staffKey)
    await waitForPack(db)
    setOnline(false)
    await scan('unknown-ticket')
    const overrideBtn = await screen.findByText('Override…')
    await act(async () => { fireEvent.click(overrideBtn) })
    expect(screen.getByText('Override: tap the attendee to check them in.')).toBeTruthy()
    expect(await db.queue.count()).toBe(0)
    await act(async () => { fireEvent.click(screen.getAllByText('Override')[1]) })
    expect(await screen.findByText('Override: Bob Byron (offline — will sync)')).toBeTruthy()
    expect(await db.queue.toArray()).toEqual([expect.objectContaining({ kind: 'override', registrationId: BOB })])
    expect(s.override).not.toHaveBeenCalled()
  })

  it('offline search runs over name + email in the local list', async () => {
    s.renderIt()
    await waitForPack(await dbFor(s.surface, s.staffKey))
    setOnline(false)
    await act(async () => { window.dispatchEvent(new Event('offline')) })
    fireEvent.click(screen.getByText(/^Attendees/))
    fireEvent.change(screen.getByLabelText('Search attendees by name or email'), { target: { value: 'bob@' } })
    expect(screen.getByText('Bob Byron')).toBeTruthy()
    expect(screen.queryByText('Ada Lovelace')).toBeNull()
  })

  it('401 session_expired keeps entries pending and shows the surface banner', async () => {
    const db = await dbFor(s.surface, s.staffKey)
    await savePack(db, SESSION, makePack())
    await enqueue(db, { sessionId: SESSION, kind: 'manual', registrationId: ADA, grant: 'g' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'x', code: 'session_expired' }), { status: 401 })))
    s.renderIt()
    expect(await screen.findByText(s.expiredText)).toBeTruthy()
    expect((await db.queue.toArray())[0].status).toBe('pending')
  })

  it('a successful sync marks entries synced, refreshes the pack, and the refresh prunes them (O125)', async () => {
    const db = await dbFor(s.surface, s.staffKey)
    await savePack(db, SESSION, makePack())
    const row = await enqueue(db, { sessionId: SESSION, kind: 'scan', token: QR_ADA, registrationId: ADA, grant: 'g' })
    const seen: (string | undefined)[] = []
    db.queue.hook('updating', (mods: object) => { seen.push((mods as { status?: string }).status) })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ processed: 1, total: 1, results: [{ entryId: row.entryId, status: 'accepted', kind: 'scan' }] }), { status: 200 })))
    s.renderIt()
    // Before the sync, and again after it.
    await waitFor(() => expect(s.fetchPack.mock.calls.length).toBeGreaterThanOrEqual(3))
    expect(seen).toContain('synced')
    // The refreshed list carries the check-in; the synced entry (and its token) is gone.
    await waitFor(async () => expect(await db.queue.get(row.entryId)).toBeUndefined())
  })

  it('a refused entry shows in needs attention with the name, not the token; Dismiss deletes the token', async () => {
    const db = await dbFor(s.surface, s.staffKey)
    await savePack(db, SESSION, makePack())
    const row = await enqueue(db, { sessionId: SESSION, kind: 'recheck', token: ghlToken('0123456789abcdef01234567'), grant: 'g' })
    await db.queue.update(row.entryId, { status: 'needs_attention', reason: "This GHL ticket isn't registered for this event" })
    s.renderIt()
    expect(await screen.findByText(/isn't registered for this event/)).toBeTruthy()
    expect(screen.getByText('v1.012…')).toBeTruthy()
    expect(screen.queryByText(ghlToken('0123456789abcdef01234567'))).toBeNull()
    await act(async () => { fireEvent.click(screen.getByText('Dismiss')) })
    await waitFor(async () => expect((await db.queue.get(row.entryId))?.status).toBe('dismissed'))
    expect(await db.queue.get(row.entryId)).not.toHaveProperty('token')
  })

  it('a pack older than 24h (refresh failing) disables offline scanning', async () => {
    const db = await dbFor(s.surface, s.staffKey)
    await savePack(db, SESSION, makePack({ grant: grantExp(Date.now() + 5 * 86400_000) }), Date.now() - PACK_MAX_AGE_MS - 60_000)
    s.fetchPack.mockRejectedValue(new TypeError('Failed to fetch'))
    s.renderIt()
    await waitFor(() => expect(s.fetchPack).toHaveBeenCalled())
    setOnline(false)
    await scan(QR_ADA)
    expect((await screen.findAllByText(PACK_TOO_OLD_MESSAGE)).length).toBeGreaterThan(0)
    expect(await db.queue.count()).toBe(0)
  })

  it('an expired grant says offline check-in is not available; online scanning is unchanged', async () => {
    s.fetchPack.mockResolvedValue(makePack({ grant: grantExp(Date.now() - 1000) }))
    s.scan.mockResolvedValue({ success: true, registration: { id: ADA, attendee_name: 'Ada Lovelace', attendee_email: '', ticket_name: '', already_checked_in: false } })
    s.renderIt()
    expect(await screen.findByText(OFFLINE_UNAVAILABLE_MESSAGE)).toBeTruthy()
    await scan(QR_ADA)
    expect(await screen.findByText(/Ada Lovelace checked in/)).toBeTruthy()
  })

  it('beforeunload prompts only while entries are pending', async () => {
    const { unmount } = s.renderIt()
    const db = await dbFor(s.surface, s.staffKey)
    await waitForPack(db)
    const fire = () => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(fire()).toBe(false)
    setOnline(false)
    await scan(QR_ADA)
    await screen.findByText(/1 pending/)
    // The listener attaches in a passive effect keyed on summary.pending; the
    // IndexedDB → setSummary chain runs outside act(), so flush effects once
    // before dispatching (deterministic, not a retry).
    await act(async () => {})
    expect(fire()).toBe(true)
    unmount()
  })
})

describe('embedded offline note', () => {
  it('shows "kept only while this page stays open" in offline mode only', async () => {
    surfaces[1].renderIt()
    await waitForPack(await dbFor('embed', 'door@org.test'))
    expect(screen.queryByText('Offline check-ins are kept only while this page stays open')).toBeNull()
    setOnline(false)
    await act(async () => { window.dispatchEvent(new Event('offline')) })
    expect(screen.getByText('Offline check-ins are kept only while this page stays open')).toBeTruthy()
  })

  it('the dashboard scanner never shows it', async () => {
    surfaces[0].renderIt()
    setOnline(false)
    await act(async () => { window.dispatchEvent(new Event('offline')) })
    expect(screen.queryByText('Offline check-ins are kept only while this page stays open')).toBeNull()
  })
})

describe('sign-out clears the scan databases', () => {
  async function openMenu() {
    render(<UserMenu email="staff@test.com" />)
    fireEvent.click(screen.getByLabelText('User menu'))
  }

  it('with nothing pending: deletes every prezva-scan database, then signs out', async () => {
    const db = await dbFor('dashboard', 'user-1')
    await savePack(db, SESSION, makePack())
    await openMenu()
    await act(async () => { fireEvent.click(screen.getByText('Sign out')) })
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
    expect(await listScanDbNames()).toEqual([])
  })

  it('with pending entries: warns first; Cancel keeps them; Sign out anyway deletes them', async () => {
    const db = await dbFor('dashboard', 'user-1')
    await enqueue(db, { sessionId: SESSION, kind: 'manual', registrationId: ADA })
    await enqueue(await dbFor('embed', 'door@org.test'), { sessionId: SESSION, kind: 'manual', registrationId: BOB })
    await openMenu()
    await act(async () => { fireEvent.click(screen.getByText('Sign out')) })
    expect(await screen.findByText('2 check-ins have not synced; signing out will discard them')).toBeTruthy()
    expect(auth.signOut).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Cancel'))
    expect((await listScanDbNames()).length).toBe(2)
    await act(async () => { fireEvent.click(screen.getByText('Sign out')) })
    const anyway = await screen.findByText('Sign out anyway')
    await act(async () => { fireEvent.click(anyway) })
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
    expect(await listScanDbNames()).toEqual([])
  })
})

describe.each([
  {
    name: 'dashboard',
    actions: dash,
    renderIt: () => render(<CheckInClient eventId={EVENT} eventName="Door" initialStats={{ total_registered: 1, total_checked_in: 0, percent: 0, recent: [] }} permissions={['*']} />),
  },
  {
    name: 'embedded',
    actions: embed,
    renderIt: () => render(<EmbedCheckInClient eventId={EVENT} eventName="Door" initialStats={{ total_registered: 1, total_checked_in: 0, percent: 0, recent: [] }} arrivalUrl="https://x" />),
  },
])('$name door — manual-search guard', ({ actions, renderIt }) => {
  it('a thrown name-search check-in shows an error and the search keeps working', async () => {
    actions.checkInBySearch.mockRejectedValue(new TypeError('Failed to fetch'))
    renderIt()
    fireEvent.click(screen.getByText('Name Search'))
    await act(async () => { fireEvent.click(screen.getByText('manual check-in')) })
    expect(await screen.findByText(MANUAL_CHECKIN_FAILED)).toBeTruthy()
    actions.checkInBySearch.mockResolvedValue({ success: true, registration: { id: ADA, attendee_name: 'Ada Lovelace', attendee_email: '', ticket_name: '', already_checked_in: false } })
    actions.getCheckInStats.mockResolvedValue({ total_registered: 1, total_checked_in: 1, percent: 100, recent: [] })
    await act(async () => { fireEvent.click(screen.getByText('manual check-in')) })
    expect(actions.checkInBySearch).toHaveBeenCalledTimes(2)
  })
})

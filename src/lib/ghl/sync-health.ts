import { createAdminClient } from '@/lib/supabase/admin'

export type SyncHealthState = 'red' | 'yellow' | 'green'
export type SyncHealthSeverity = 'red' | 'yellow'

export interface SyncHealthRow {
  id: string
  status: string
  last_error: string | null
  event_type: string
  external_event_id: string
  created_at: string
  updated_at: string
  severity: SyncHealthSeverity
}

export interface SyncHealthResult {
  state: SyncHealthState
  redCount: number
  yellowCount: number
  rows: SyncHealthRow[]
}

interface RawSyncStateRow {
  id: string
  status: string
  last_error: string | null
  event_type: string
  external_event_id: string
  created_at: string
  updated_at: string
}

const STUCK_THRESHOLD_MS = 15 * 60 * 1000
const IN_FLIGHT_STATUSES = new Set(['pending', 'queued_for_sync'])

// status is the state machine, last_error is the diagnostic ledger — a row
// can carry a stale last_error while healthy (e.g. a canary that survived
// into 'synced'). Only in-flight rows get a time-based grace period: a
// freshly-created pending/queued_for_sync row is expected to look
// "unfinished" and must not color the pill until it's actually stuck.
function classify(row: RawSyncStateRow, now: number): SyncHealthSeverity | null {
  if (row.status === 'failed') return 'red'
  if (row.status === 'waitlisted') return 'red'

  const inFlight = IN_FLIGHT_STATUSES.has(row.status)
  if (inFlight) {
    const ageMs = now - new Date(row.updated_at).getTime()
    return ageMs >= STUCK_THRESHOLD_MS ? 'red' : null
  }

  if (row.last_error) return 'yellow'
  return null
}

export async function getSyncHealth(orgId: string): Promise<SyncHealthResult> {
  const db = createAdminClient()

  const { data: links } = await db
    .from('ghl_location_links')
    .select('ghl_location_id')
    .eq('org_id', orgId)

  const locationIds = (links ?? []).map(l => l.ghl_location_id)
  if (locationIds.length === 0) {
    return { state: 'green', redCount: 0, yellowCount: 0, rows: [] }
  }

  const { data: syncRows } = await db
    .from('ghl_sync_state')
    .select('id, status, last_error, event_type, external_event_id, created_at, updated_at')
    .in('location_id', locationIds)
    .is('acknowledged_at', null)

  const now = Date.now()
  const red: SyncHealthRow[] = []
  const yellow: SyncHealthRow[] = []

  for (const row of (syncRows ?? []) as RawSyncStateRow[]) {
    const severity = classify(row, now)
    if (!severity) continue
    const entry: SyncHealthRow = { ...row, severity }
    if (severity === 'red') red.push(entry)
    else yellow.push(entry)
  }

  const state: SyncHealthState = red.length > 0 ? 'red' : yellow.length > 0 ? 'yellow' : 'green'

  return {
    state,
    redCount: red.length,
    yellowCount: yellow.length,
    rows: [...red, ...yellow],
  }
}

// ── Translation ──────────────────────────────────────────────────────────────
// Organizer-facing copy for known last_error forms written by the payment
// webhook (src/app/api/ghl/webhooks/payment/route.ts) and the sync job
// (src/trigger/jobs/ghl-sync.ts). Anything unmatched falls back to the raw
// text rather than hiding it.

const EXACT_TRANSLATIONS: Record<string, string> = {
  location_not_bound: 'This payment came from a GHL location that is not connected to any Prezva organization.',
  ticket_not_mapped: "This payment's product is not linked to any event ticket type. Link the product in the event's ticket settings.",
  tenant_mismatch: "This payment's product is linked to an event in a different organization.",
  entitlement_blocked: 'A payment arrived while the plan was inactive, so no registration was created.',
}

const PREFIX_TRANSLATIONS: Array<[prefix: string, message: string]> = [
  ['amount_divergence', 'The amount paid was higher than the ticket price - this may be a multi-seat purchase, which creates only one registration.'],
  ['amount_unverifiable', 'The payment could not be checked against a ticket price.'],
  ['no_ghl_access_token', 'The GHL connection needs attention - a contact update could not be delivered.'],
]

const WAITLISTED_NO_ERROR = 'A payment was received but the ticket was at capacity - the buyer holds no registration.'

export function translateSyncError(lastError: string | null, status: string): string {
  if (!lastError) {
    return status === 'waitlisted' ? WAITLISTED_NO_ERROR : 'This sync issue needs review.'
  }

  if (EXACT_TRANSLATIONS[lastError]) return EXACT_TRANSLATIONS[lastError]

  const prefixMatch = PREFIX_TRANSLATIONS.find(([prefix]) => lastError.startsWith(prefix))
  if (prefixMatch) return prefixMatch[1]

  return lastError
}

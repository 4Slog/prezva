import { createHash } from 'node:crypto'
import type { createAdminClient } from '@/lib/supabase/admin'

// M3b: the attendee list an offline session scanner holds (R86). Confirmed
// registrations of THIS event only. The two scan identifiers are never sent
// raw — only as SHA-256 hex of the lowercased value, which is what the device
// computes from a scanned token to match offline. Email is included (the
// override search needs it).

export interface OfflinePackAttendee {
  registrationId: string
  name: string
  email: string
  ticketName: string
  ghlIdHash: string | null
  qrHash: string | null
  // This session's check-in, if any.
  checkedInAt: string | null
}

export interface OfflineSessionPack {
  serverNow: string
  grant: string
  eventEndsAt: string | null
  attendees: OfflinePackAttendee[]
}

// PostgREST returns at most this many rows per request (O119); page past it.
export const PACK_PAGE_SIZE = 1000

// Device side must match: sha256(lowercase(value)) as lowercase hex. For a scan,
// value = parseScanToken(raw).attendeeId (GHL) or .qrCode (Prezva), else
// raw.toLowerCase() — the same text the online lookup compares.
export function packHash(value: string): string {
  return createHash('sha256').update(value.toLowerCase(), 'utf8').digest('hex')
}

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

// Reads every page of an ordered query. `page(from, to)` must apply a stable
// order so pages neither overlap nor skip.
export async function readAllPages<T>(page: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PACK_PAGE_SIZE) {
    const { data, error } = await page(from, from + PACK_PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PACK_PAGE_SIZE) return rows
  }
}

type PackRegRow = {
  id: string
  attendee_name: string | null
  attendee_email: string | null
  qr_code: string | null
  ghl_attendee_id: string | null
  ticket_types: { name: string } | null
}

type PackDb = ReturnType<typeof createAdminClient>

export async function loadOfflinePackAttendees(
  db: PackDb,
  eventId: string,
  sessionId: string,
): Promise<OfflinePackAttendee[]> {
  const regs = await readAllPages<PackRegRow>((from, to) =>
    (db.from('registrations')
      .select('id, attendee_name, attendee_email, qr_code, ghl_attendee_id, ticket_types(name)')
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .order('id')
      .range(from, to)) as unknown as PageResult<PackRegRow>,
  )
  const checkIns = await readAllPages<{ registration_id: string; checked_in_at: string | null }>((from, to) =>
    db.from('check_ins')
      .select('registration_id, checked_in_at')
      .eq('event_id', eventId)
      .eq('session_id', sessionId)
      .order('id')
      .range(from, to),
  )
  const checkedIn = new Map(checkIns.map(c => [c.registration_id, c.checked_in_at]))

  return regs
    .map(r => ({
      registrationId: r.id,
      name: r.attendee_name ?? '',
      email: r.attendee_email ?? '',
      ticketName: r.ticket_types?.name ?? '',
      ghlIdHash: r.ghl_attendee_id ? packHash(r.ghl_attendee_id) : null,
      qrHash: r.qr_code ? packHash(r.qr_code) : null,
      checkedInAt: checkedIn.get(r.id) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

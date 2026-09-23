import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOrgOwnerProfileId } from '@/lib/embedded/org-helpers'

// Resolution helpers for the GHL Events lane (R65).
//
// GoHighLevel shipped a native Events module, so Prezva attaches to it rather than
// replacing it: GHL owns the event and the order, and these helpers map what the
// webhook reports onto the rows Prezva's own tables require. Nothing here creates a
// GHL opportunity or touches a pipeline stage — that is the defining constraint of
// this lane.

const FALLBACK_TICKET_TYPE_NAME = 'GHL Registration'

// ── Money ─────────────────────────────────────────────────────────────────────

/**
 * GHL Events reports money as a decimal-dollar STRING — "199" means $199.00, not
 * 199 cents. Everything downstream (registrations.amount_paid_cents, the
 * multi-seat tripwire, Stripe parity) is integer cents, so the conversion has to
 * happen exactly once, here.
 *
 * The unit is in the name on purpose. A reader who sees `toCents(order_total)`
 * cannot tell whether the input was already cents; `ghlDollarStringToCents` can
 * only be called correctly. Do not rename it to anything unit-free.
 *
 * Absent means zero — a free ticket reports no total. Unparseable does NOT mean
 * zero: silently booking a paid seat at $0.00 is the kind of wrong that reconciles
 * to a real money gap weeks later, so it throws and the caller records the refusal.
 */
export function ghlDollarStringToCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'string' && value.trim() === '') return 0

  const dollars = Number(value)
  if (!Number.isFinite(dollars)) {
    throw new Error(`ghlDollarStringToCents: not a finite number: ${JSON.stringify(value)}`)
  }
  return Math.round(dollars * 100)
}

/**
 * Per-seat share of an ORDER-scoped total, in cents.
 *
 * On the GHL Events WORKFLOW path `order_total` is scoped to the ORDER and repeated
 * verbatim on every attendee's call — a 2-seat $398 order fires the workflow twice
 * and sends "398" both times. Storing that figure on each seat double-counts the
 * order across registrations.amount_paid_cents, and the error compounds with seat
 * count. Dividing here keeps each seat's row honest; the ORDER-level total stays
 * recoverable at any time by grouping registrations on ghl_order_id, so splitting
 * it costs nothing.
 *
 * The unit is in the name for the same reason `ghlDollarStringToCents` and
 * `formatGhlDollars` carry theirs: a bare `perSeat(total, n)` cannot be read as
 * right or wrong at the call site.
 *
 * Never throws, and never refuses a seat. An absent or unusable ticket_count yields
 * the total unchanged — one seat booked at the full order price is visible and
 * correctable, whereas dropping a registration GHL has already been paid for is
 * not. The caller warns on that path rather than failing.
 */
export function perSeatCents(orderTotalCents: number, ticketCountRaw: unknown): number {
  const ticketCount =
    typeof ticketCountRaw === 'number'
      ? ticketCountRaw
      : typeof ticketCountRaw === 'string'
        ? Number.parseInt(ticketCountRaw.trim(), 10)
        : Number.NaN

  // Number.isInteger is false for NaN and for both Infinities, so this one check
  // covers finite, integral and parsed-at-all.
  if (!Number.isInteger(ticketCount) || ticketCount < 1) return orderTotalCents

  return Math.round(orderTotalCents / ticketCount)
}

// ── Event ─────────────────────────────────────────────────────────────────────

export type ResolveEventResult =
  | { ok: true; eventId: string; slug: string; created: boolean }
  | { ok: false; error: string }

export interface ResolveEventParams {
  db: SupabaseClient
  /** Org that owns the GHL location this webhook authenticated against. */
  orgId: string
  ghlEventId: string
  title: string | null | undefined
  startAt: string | null | undefined
  endAt: string | null | undefined
  /**
   * The event's own timezone, from the webhook payload. Required to CREATE.
   * There is deliberately no fallback — see the guard below.
   */
  timezone: string | null | undefined
}

/**
 * Intl.DateTimeFormat is the authority on whether a zone name is real: it throws
 * RangeError on anything it cannot resolve, including the empty string. That makes
 * it a cheaper and more current check than any list we could ship.
 */
function isValidIanaZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

function toSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function generateUniqueSlug(db: SupabaseClient, orgId: string, base: string): Promise<string> {
  const seed = base || 'ghl-event'
  let slug = seed
  for (let suffix = 2; suffix < 22; suffix++) {
    const { data } = await db
      .from('events')
      .select('id')
      .eq('org_id', orgId)
      .eq('slug', slug)
      .maybeSingle()
    if (!data) return slug
    slug = `${seed}-${suffix}`
  }
  throw new Error('Could not generate a unique slug after 20 attempts')
}

async function findByGhlEventId(
  db: SupabaseClient,
  ghlEventId: string,
): Promise<{ id: string; slug: string } | null> {
  const { data } = await db
    .from('events')
    .select('id, slug')
    .eq('ghl_event_id', ghlEventId)
    .maybeSingle()
  return data ? { id: data.id, slug: data.slug } : null
}

/**
 * Maps a GHL event onto a Prezva event, creating one the first time we see it.
 *
 * The created event is a DRAFT and not discoverable. GHL is the system of record
 * for the event itself; this row exists so registrations have somewhere to live,
 * and an organizer decides whether it is ever published on Prezva's side.
 */
export async function resolveOrCreateEventFromGhl(
  params: ResolveEventParams,
): Promise<ResolveEventResult> {
  const { db, orgId, ghlEventId, title, startAt, endAt, timezone } = params

  if (!ghlEventId) return { ok: false, error: 'ghl_event_id_missing' }

  const existing = await findByGhlEventId(db, ghlEventId)
  if (existing) return { ok: true, eventId: existing.id, slug: existing.slug, created: false }

  // Everything below is the CREATE path, and every guard on it refuses rather than
  // invents. An event carrying a guessed date or a guessed zone looks identical to a
  // correct one and is discovered only when a reminder fires on the wrong day.
  if (!title || !title.trim()) return { ok: false, error: 'event_title_missing' }
  if (!startAt) return { ok: false, error: 'event_start_at_missing' }
  if (!endAt) return { ok: false, error: 'event_end_at_missing' }

  // No fallback to UTC, to the org's timezone, or to any literal. An 8pm event in
  // America/New_York is the NEXT DAY in UTC, so a defaulted zone silently moves
  // every reminder and every certificate completion date by up to a day. Refusing
  // is recoverable; a wrong zone is not, because nothing downstream can tell.
  if (!timezone || !timezone.trim()) return { ok: false, error: 'event_timezone_missing' }
  if (!isValidIanaZone(timezone)) return { ok: false, error: `event_timezone_invalid: ${timezone}` }

  let createdBy: string
  let slug: string
  try {
    createdBy = await resolveOrgOwnerProfileId(db, orgId)
    slug = await generateUniqueSlug(db, orgId, toSlug(title))
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  const { data, error } = await db
    .from('events')
    .insert({
      org_id:          orgId,
      created_by:      createdBy,
      title:           title.trim(),
      slug,
      timezone,
      start_at:        startAt,
      end_at:          endAt,
      status:          'draft',
      visibility:      'private',
      is_discoverable: false,
      ghl_event_id:    ghlEventId,
    })
    .select('id, slug')
    .single()

  if (error) {
    // Two attendees on the same brand-new GHL event can arrive concurrently and
    // both miss the read above. events_ghl_event_id_key is the real guard; a 23505
    // on it means the other delivery created the row this call wanted.
    if (error.code === '23505') {
      const raced = await findByGhlEventId(db, ghlEventId)
      if (raced) return { ok: true, eventId: raced.id, slug: raced.slug, created: false }
    }
    return { ok: false, error: `event_create_failed: ${error.message}` }
  }

  return { ok: true, eventId: data.id, slug: data.slug, created: true }
}

// ── Ticket type ───────────────────────────────────────────────────────────────

/**
 * Is this GHL ticket name fit to become a ticket_types.name of its own?
 *
 * The rules and the reasoning live on resolveOrCreateTicketTypeForGhlEvent below;
 * this is just the predicate. Returns the usable name, or null to fall back.
 */
function usableTicketTypeName(wanted: string | undefined): string | null {
  if (!wanted) return null
  if (wanted.includes(',')) return null
  if (wanted.length > 100) return null
  if (wanted.toLowerCase() === FALLBACK_TICKET_TYPE_NAME.toLowerCase()) return null
  return wanted
}

/**
 * Resolves the ticket_types row a GHL Events registration hangs off.
 *
 * registrations.ticket_type_id is NOT NULL, so this has to produce an id for a
 * registration to exist at all — but a ticket type is a LABEL on this lane, not a
 * gate. GHL already took the money; refusing the attendee because the payload's
 * ticket name was blank or unrecognised would lose a paid seat over a caption.
 * So an unusable name falls back to a shared "GHL Registration" type rather than
 * failing.
 *
 * A USABLE name is kept: it names the type we create, so an R66 auto-created event
 * ends up with the tiers GHL actually sold instead of collapsing every one of them
 * into a single generic row. A name is usable when, trimmed, it is non-empty,
 * contains NO COMMA, is at most 100 characters, and is not the fallback name.
 *
 * The comma rule is the one that needs explaining. GHL's only ticket-name merge
 * field is "Event . Ticket . Names" — PLURAL, and comma-joined across the whole
 * ORDER. A mixed-tier order therefore delivers one string, "Early Bird, Standard",
 * to every seat on it. Minting a type from that would create a permanent ticket
 * type named after two tiers at once and hang both attendees off it, which is
 * worse than an honest generic label. A comma means the payload is describing an
 * order rather than a tier, so the name is not trustworthy and the seat falls back.
 * (Over 100 characters is the same failure wearing a different hat: a runaway merge
 * field, not a tier.)
 *
 * A usable name goes STRAIGHT to create, deliberately skipping the fallback read.
 * Otherwise a single "GHL Registration" row — minted the one time an order arrived
 * with an unusable name — would capture every later tier on that event and quietly
 * undo all of this.
 *
 * Returns null ONLY when the database itself would not yield a row — not a naming
 * problem, and the caller should record it as an infrastructure failure rather than
 * a rejected attendee.
 */
export async function resolveOrCreateTicketTypeForGhlEvent(params: {
  db: SupabaseClient
  eventId: string
  name?: string | null
}): Promise<string | null> {
  const { db, eventId } = params
  const wanted = params.name?.trim()

  // ilike with no wildcards is an exact, case-insensitive match: GHL's product
  // names are typed by humans and their capitalisation drifts between orders.
  if (wanted) {
    const { data } = await db
      .from('ticket_types')
      .select('id')
      .eq('event_id', eventId)
      .ilike('name', wanted)
      .limit(1)
      .maybeSingle()
    if (data) return data.id
  }

  const usable = usableTicketTypeName(wanted)

  if (!usable) {
    // Only worth a line when GHL sent something and we threw it away. A missing
    // name is routine; a rejected one is a payload we may want to look at.
    if (wanted) {
      console.warn(
        '[ghl-events] ticket type fell back to',
        FALLBACK_TICKET_TYPE_NAME,
        'for event',
        eventId,
        '— unusable ticket name:',
        JSON.stringify(wanted),
      )
    }

    const { data: fallback } = await db
      .from('ticket_types')
      .select('id')
      .eq('event_id', eventId)
      .ilike('name', FALLBACK_TICKET_TYPE_NAME)
      .limit(1)
      .maybeSingle()
    if (fallback) return fallback.id
  }

  const attemptedName = usable ?? FALLBACK_TICKET_TYPE_NAME

  const { data: created, error } = await db
    .from('ticket_types')
    .insert({
      event_id:   eventId,
      name:       attemptedName,
      type:       'paid',
      is_visible: false,
      is_active:  true,
    })
    .select('id')
    .single()

  if (created) return created.id

  // Losing a race to create is the expected failure here, and the winner's row is
  // exactly the one this call wanted — but only if we look for the SAME name we
  // attempted. A concurrent seat on the same tier creates THAT tier's row, not the
  // fallback's, so re-reading the fallback would miss it and lose the seat.
  const { data: raced } = await db
    .from('ticket_types')
    .select('id')
    .eq('event_id', eventId)
    .ilike('name', attemptedName)
    .limit(1)
    .maybeSingle()
  if (raced) return raced.id

  console.error('[ghl-events] could not resolve or create a ticket type for event', eventId, error)
  return null
}

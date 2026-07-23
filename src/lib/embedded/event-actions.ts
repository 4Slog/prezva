'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { resolveOrgOwnerProfileId } from '@/lib/embedded/org-helpers'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { ghlGet } from '@/lib/integrations/ghl/client'
import { requireEntitlement } from '@/lib/entitlements'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GhlProduct {
  _id: string
  name: string
  productType: string
  status: string
  locationId: string
}

interface GhlPrice {
  _id: string
  product: string
  name: string
  type: string
  currency: string
  amount: number
  availableQuantity?: number | null
  trackInventory: boolean
}

interface GhlProductListResponse {
  products: GhlProduct[]
}

interface GhlPriceListResponse {
  prices?: GhlPrice[]
  list?: GhlPrice[]
  // Some GHL endpoints return a direct array
  [key: string]: unknown
}

export interface GhlPickerProduct {
  productId: string
  priceId: string
  productName: string
  priceName: string
  // GHL price.amount is DOLLARS, not cents (verified 2026-07-09 against GHL Payments >
  // Products: a $225.00 product returns amount=225). Prezva stores integer cents, so
  // any downstream *100 conversion (see price_cents below) is correct and must stay.
  amount: number
  currency: string
  availableQuantity: number | null
  alreadyMapped: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function resolveEmbedContext() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) throw new Error('No embed session')
  const session = await verifyEmbeddedSession(token)
  const db = createAdminClient()
  const { data: link } = await db
    .from('ghl_location_links')
    .select('org_id')
    .eq('ghl_location_id', session.location_id)
    .maybeSingle()
  if (!link) throw new Error('Location not linked to any organization')
  return { session, db, orgId: link.org_id, locationId: session.location_id }
}

async function generateUniqueSlug(
  db: ReturnType<typeof createAdminClient>,
  orgId: string,
  base: string,
): Promise<string> {
  let slug = base
  let suffix = 2
  for (let i = 0; i < 20; i++) {
    const { data } = await db
      .from('events')
      .select('id')
      .eq('org_id', orgId)
      .eq('slug', slug)
      .maybeSingle()
    if (!data) return slug
    slug = `${base}-${suffix++}`
  }
  throw new Error('Could not generate a unique slug after 20 attempts')
}

// ── Validation ────────────────────────────────────────────────────────────────

const EmbedCreateEventSchema = z.object({
  title:       z.string().min(2).max(120),
  description: z.string().max(5000).optional(),
  event_type:  z.enum(['in_person', 'virtual', 'hybrid']).default('in_person'),
  timezone:    z.string().min(1).optional(),
  start_at:    z.string().min(1).transform(v =>
    v.includes('Z') || v.includes('+') ? v : new Date(v).toISOString(),
  ),
  end_at:      z.string().min(1).transform(v =>
    v.includes('Z') || v.includes('+') ? v : new Date(v).toISOString(),
  ),
  venue_name:    z.string().max(120).optional(),
  venue_address: z.string().max(200).optional(),
  venue_city:    z.string().max(80).optional(),
  venue_state:   z.string().max(80).optional(),
  virtual_url:   z.string().url().optional().or(z.literal('')),
}).refine(d => new Date(d.end_at) > new Date(d.start_at), {
  message: 'End time must be after start time',
  path: ['end_at'],
})

// ── Server Actions ────────────────────────────────────────────────────────────

export async function createEventFromEmbed(
  formData: FormData,
): Promise<{ id: string; slug: string } | { error: string }> {
  let ctx: Awaited<ReturnType<typeof resolveEmbedContext>>
  try {
    ctx = await resolveEmbedContext()
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { session, db, orgId } = ctx

  const raw = {
    title:        formData.get('title'),
    description:  formData.get('description') || undefined,
    event_type:   formData.get('event_type') || 'in_person',
    timezone:     formData.get('timezone') || undefined,
    start_at:     formData.get('start_at'),
    end_at:       formData.get('end_at'),
    venue_name:    formData.get('venue_name') || undefined,
    venue_address: formData.get('venue_address') || undefined,
    venue_city:    formData.get('venue_city') || undefined,
    venue_state:   formData.get('venue_state') || undefined,
    virtual_url:   formData.get('virtual_url') || undefined,
  }

  const parsed = EmbedCreateEventSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  let created_by: string
  try {
    created_by = await resolveOrgOwnerProfileId(db, orgId)
  } catch (e) {
    return { error: (e as Error).message }
  }

  const baseSlug = toSlug(parsed.data.title)
  let slug: string
  try {
    slug = await generateUniqueSlug(db, orgId, baseSlug)
  } catch (e) {
    return { error: (e as Error).message }
  }

  // Explicit submitted value always wins; otherwise derive from the org.
  let timezone = parsed.data.timezone
  if (!timezone) {
    const { data: org } = await db.from('organizations').select('timezone').eq('id', orgId).maybeSingle()
    timezone = org?.timezone
  }
  if (!timezone) return { error: 'Could not determine a timezone for this event.' }

  const { data: event, error } = await db
    .from('events')
    .insert({
      ...parsed.data,
      timezone,
      org_id: orgId,
      created_by,
      slug,
      ghl_creator_email: session.user_email ?? null,
    })
    .select('id, slug')
    .single()

  if (error || !event) return { error: error?.message ?? 'Failed to create event' }
  return { id: event.id, slug: event.slug }
}

// ── Update event (edit) ───────────────────────────────────────────────────────

const EmbedUpdateEventSchema = z.object({
  title:        z.string().min(2).max(120).optional(),
  description:  z.string().max(5000).optional(),
  event_type:   z.enum(['in_person', 'virtual', 'hybrid']).optional(),
  timezone:     z.string().min(1).optional(),
  start_at:     z.string().min(1).transform(v =>
    v.includes('Z') || v.includes('+') ? v : new Date(v).toISOString(),
  ).optional(),
  end_at:       z.string().min(1).transform(v =>
    v.includes('Z') || v.includes('+') ? v : new Date(v).toISOString(),
  ).optional(),
  venue_name:    z.string().max(120).optional(),
  venue_address: z.string().max(200).optional(),
  venue_city:    z.string().max(80).optional(),
  venue_state:   z.string().max(80).optional(),
  virtual_url:   z.string().url().optional().or(z.literal('')),
}).refine(d => !d.start_at || !d.end_at || new Date(d.end_at) > new Date(d.start_at), {
  message: 'End time must be after start time',
  path: ['end_at'],
})

export async function embedUpdateEvent(
  eventId: string,
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  let ctx: Awaited<ReturnType<typeof resolveEmbedContext>>
  try {
    ctx = await resolveEmbedContext()
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { db, orgId } = ctx

  // IDOR guard: event must belong to this org
  const { data: existing } = await db
    .from('events')
    .select('id')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!existing) return { error: 'Event not found' }

  const raw = {
    title:        formData.get('title') || undefined,
    description:  formData.get('description') || undefined,
    event_type:   formData.get('event_type') || undefined,
    timezone:     formData.get('timezone') || undefined,
    start_at:     formData.get('start_at') || undefined,
    end_at:       formData.get('end_at') || undefined,
    venue_name:    formData.get('venue_name') || undefined,
    venue_address: formData.get('venue_address') || undefined,
    venue_city:    formData.get('venue_city') || undefined,
    venue_state:   formData.get('venue_state') || undefined,
    virtual_url:   formData.get('virtual_url') || undefined,
  }

  const parsed = EmbedUpdateEventSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Build update object from only the keys present in parsed.data
  const updateObj: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) updateObj[k] = v
  }

  if (Object.keys(updateObj).length === 0) return { ok: true }

  const { error: updateError } = await db
    .from('events')
    .update(updateObj)
    .eq('id', eventId)
    .eq('org_id', orgId)

  if (updateError) return { error: updateError.message }

  revalidatePath(`/embedded/events/${eventId}/settings`)
  return { ok: true }
}

// ── Publish (embed lane only) ─────────────────────────────────────────────────
//
// Mirrors ONLY the draft->published and published->live edges of the
// standalone VALID_TRANSITIONS table (src/lib/events/actions.ts) — the
// embed lane never touches live->ended or the cancel/archive edges, and
// deliberately does not import or call transitionEventStatus. Gated by
// requireEntitlement: FREE orgs can build and preview drafts but cannot
// take an event live to a real GHL-linked audience (R36-R41).
const EMBED_VALID_TRANSITIONS: Record<string, string> = {
  draft: 'published',
  published: 'live',
}

export async function embedPublishEvent(
  eventId: string,
): Promise<{ ok: true; status: string } | { error: string }> {
  let ctx: Awaited<ReturnType<typeof resolveEmbedContext>>
  try {
    ctx = await resolveEmbedContext()
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { db, orgId } = ctx

  const gate = await requireEntitlement(orgId)
  if (gate) return gate

  // IDOR guard: event must belong to this org
  const { data: existing } = await db
    .from('events')
    .select('id, status')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!existing) return { error: 'Event not found' }

  const currentStatus = existing.status ?? 'draft'
  const nextStatus = EMBED_VALID_TRANSITIONS[currentStatus]
  if (!nextStatus) return { error: `Cannot publish from '${currentStatus}'` }

  const { error } = await db
    .from('events')
    .update({ status: nextStatus })
    .eq('id', eventId)
    .eq('org_id', orgId)
  if (error) return { error: error.message }

  revalidatePath(`/embedded/events/${eventId}`)
  return { ok: true, status: nextStatus }
}

export async function createTicketTypeFromEmbedProduct(
  eventId: string,
  ghlProductId: string,
  ghlPriceId: string,
): Promise<{ ticketTypeId: string; mappingId: string } | { error: string }> {
  let ctx: Awaited<ReturnType<typeof resolveEmbedContext>>
  try {
    ctx = await resolveEmbedContext()
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { db, orgId, locationId } = ctx

  const gate = await requireEntitlement(orgId)
  if (gate) return gate

  // Verify the event belongs to this org
  const { data: eventRow } = await db
    .from('events')
    .select('id, org_id')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!eventRow) return { error: 'Event not found or access denied' }

  // Idempotency: return existing mapping if already created
  const { data: existing } = await db
    .from('ticket_type_product_mappings')
    .select('id, ticket_type_id')
    .eq('event_id', eventId)
    .eq('ghl_price_id', ghlPriceId)
    .maybeSingle()
  if (existing) return { ticketTypeId: existing.ticket_type_id, mappingId: existing.id }

  const token = await ghlAdapter.getAccessToken(orgId)
  if (!token) return { error: 'Your GHL connection needs attention — reconnect it from Settings and try again.' }

  // Fetch GHL product + prices
  let product: GhlProduct
  let price: GhlPrice | undefined
  try {
    product = await ghlGet<GhlProduct>(
      token,
      `/products/${ghlProductId}?locationId=${locationId}`,
    )
    const pricesRes = await ghlGet<GhlPriceListResponse | GhlPrice[]>(
      token,
      `/products/${ghlProductId}/price?locationId=${locationId}`,
    )
    const priceList: GhlPrice[] = Array.isArray(pricesRes)
      ? pricesRes
      : (pricesRes as GhlPriceListResponse).prices
        ?? (pricesRes as GhlPriceListResponse).list
        ?? []
    price = priceList.find(p => p._id === ghlPriceId)
  } catch (e) {
    return { error: `Failed to fetch GHL product: ${(e as Error).message}` }
  }

  if (!price) return { error: 'GHL price not found' }

  const type = price.amount > 0 ? 'paid' : 'free'
  const quantity = price.trackInventory && price.availableQuantity != null
    ? price.availableQuantity
    : null

  // Insert ticket_type first
  const { data: ticketType, error: ttErr } = await db
    .from('ticket_types')
    .insert({
      event_id:        eventId,
      name:            product.name,
      type,
      // price.amount is dollars (verified 2026-07-09 against GHL Payments > Products);
      // Prezva stores integer cents, so *100 is correct here — do not remove.
      price_cents:     Math.round(price.amount * 100),
      currency:        price.currency.toLowerCase(),
      quantity:        quantity ?? undefined,
      delivery_method: 'in_person',
      is_visible:      true,
      is_active:       true,
    })
    .select('id')
    .single()

  if (ttErr || !ticketType) {
    return { error: ttErr?.message ?? 'Failed to create ticket type' }
  }

  // Insert mapping; on unique violation clean up the ticket_type
  const { data: mapping, error: mapErr } = await db
    .from('ticket_type_product_mappings')
    .insert({
      ticket_type_id:  ticketType.id,
      event_id:        eventId,
      org_id:          orgId,
      ghl_location_id: locationId,
      ghl_product_id:  ghlProductId,
      ghl_price_id:    ghlPriceId,
      ghl_product_name: product.name,
      ghl_price_name:   price.name,
      // price.amount is dollars (verified 2026-07-09 against GHL Payments > Products);
      // Prezva stores integer cents, so *100 is correct here — do not remove.
      price_cents:     Math.round(price.amount * 100),
      currency:        price.currency.toLowerCase(),
    })
    .select('id')
    .single()

  if (mapErr) {
    await db.from('ticket_types').delete().eq('id', ticketType.id)
    if (mapErr.code === '23505') return { error: 'price_already_mapped' }
    return { error: mapErr.message }
  }

  return { ticketTypeId: ticketType.id, mappingId: mapping.id }
}

// ── Sync-health acknowledge (embed lane, read-time only) ─────────────────────

export async function acknowledgeSyncIssue(
  rowId: string,
): Promise<{ ok: true } | { error: string }> {
  let ctx: Awaited<ReturnType<typeof resolveEmbedContext>>
  try {
    ctx = await resolveEmbedContext()
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { db, orgId } = ctx

  const gate = await requireEntitlement(orgId)
  if (gate) return gate

  const { data: row } = await db
    .from('ghl_sync_state')
    .select('id, location_id')
    .eq('id', rowId)
    .maybeSingle()
  if (!row) return { error: 'Sync issue not found' }

  // IDOR guard: the row's location must resolve to the caller's org — not
  // just match the caller's own session location, since an org can have
  // multiple linked GHL locations.
  const { data: link } = await db
    .from('ghl_location_links')
    .select('org_id')
    .eq('ghl_location_id', row.location_id)
    .maybeSingle()
  if (!link || link.org_id !== orgId) return { error: 'Sync issue not found' }

  const { error } = await db
    .from('ghl_sync_state')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', rowId)
  if (error) return { error: error.message }

  revalidatePath('/embedded/events')
  return { ok: true }
}

export async function listGhlProductsForPicker(
  eventId?: string,
): Promise<GhlPickerProduct[] | { error: string }> {
  let ctx: Awaited<ReturnType<typeof resolveEmbedContext>>
  try {
    ctx = await resolveEmbedContext()
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { db, orgId, locationId } = ctx

  // Fetch already-mapped price IDs for this event (to mark alreadyMapped)
  const mappedPriceIds = new Set<string>()
  if (eventId) {
    const { data: mappings } = await db
      .from('ticket_type_product_mappings')
      .select('ghl_price_id')
      .eq('event_id', eventId)
    for (const m of mappings ?? []) mappedPriceIds.add(m.ghl_price_id)
  }

  const token = await ghlAdapter.getAccessToken(orgId)
  if (!token) return { error: 'Your GHL connection needs attention — reconnect it from Settings and try again.' }

  try {
    const productsRes = await ghlGet<GhlProductListResponse>(
      token,
      `/products/?locationId=${locationId}&limit=100`,
    )
    const products = productsRes.products ?? []

    const result: GhlPickerProduct[] = []
    await Promise.all(
      products
        .filter(p => p.status === 'active')
        .map(async product => {
          try {
            const pricesRes = await ghlGet<GhlPriceListResponse | GhlPrice[]>(
              token,
              `/products/${product._id}/price?locationId=${locationId}`,
            )
            const priceList: GhlPrice[] = Array.isArray(pricesRes)
              ? pricesRes
              : (pricesRes as GhlPriceListResponse).prices
                ?? (pricesRes as GhlPriceListResponse).list
                ?? []
            for (const price of priceList) {
              result.push({
                productId:         product._id,
                priceId:           price._id,
                productName:       product.name,
                priceName:         price.name,
                amount:            price.amount,
                currency:          price.currency,
                availableQuantity: price.trackInventory ? (price.availableQuantity ?? null) : null,
                alreadyMapped:     mappedPriceIds.has(price._id),
              })
            }
          } catch {
            // Skip products whose prices fail to load
          }
        }),
    )
    return result
  } catch (e) {
    return { error: `Failed to fetch GHL products: ${(e as Error).message}` }
  }
}

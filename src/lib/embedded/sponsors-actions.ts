'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// ── Embed context (session → location → org) ─────────────────────────────────

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
  return { db, orgId: link.org_id }
}

async function assertEventOwnership(
  db: ReturnType<typeof createAdminClient>,
  eventId: string,
  orgId: string,
) {
  const { data } = await db
    .from('events')
    .select('id, org_id')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!data) throw new Error('Event not found or access denied')
  return data
}

// ── Sponsors ──────────────────────────────────────────────────────────────────

const SponsorSchema = z.object({
  name: z.string().min(1).max(200),
  website_url: z.string().url().optional().or(z.literal('')),
  logo_url: z.string().url().optional().or(z.literal('')),
  tier: z.enum(['title', 'gold', 'silver', 'bronze']),
  sort_order: z.coerce.number().int().default(0),
  is_featured: z.coerce.boolean().default(false),
})

export async function embedGetSponsors(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const [sponsorsResult, eventResult] = await Promise.all([
    db
      .from('event_sponsors')
      .select('*')
      .eq('event_id', eventId)
      .order('tier')
      .order('sort_order')
      .order('created_at'),
    db.from('events').select('slug').eq('id', eventId).single(),
  ])

  return {
    sponsors: sponsorsResult.data ?? [],
    eventSlug: (eventResult.data as any)?.slug ?? '',
  }
}

export async function embedCreateSponsor(eventId: string, formData: FormData) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const parsed = SponsorSchema.safeParse({
    name: formData.get('name'),
    website_url: formData.get('website_url') || undefined,
    logo_url: formData.get('logo_url') || undefined,
    tier: formData.get('tier'),
    sort_order: formData.get('sort_order') ?? 0,
    is_featured: formData.get('is_featured') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { website_url, logo_url, ...rest } = parsed.data
  const { error } = await db.from('event_sponsors').insert({
    event_id: eventId,
    ...rest,
    website_url: website_url || null,
    logo_url: logo_url || null,
  })
  if (error) return { error: error.message }
  revalidatePath('/embedded/events/[eventId]/sponsors', 'page')
  return { ok: true }
}

export async function embedUpdateSponsor(
  sponsorId: string,
  eventId: string,
  formData: FormData,
) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const parsed = SponsorSchema.safeParse({
    name: formData.get('name'),
    website_url: formData.get('website_url') || undefined,
    logo_url: formData.get('logo_url') || undefined,
    tier: formData.get('tier'),
    sort_order: formData.get('sort_order') ?? 0,
    is_featured: formData.get('is_featured') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { website_url, logo_url, ...rest } = parsed.data
  const { error } = await db
    .from('event_sponsors')
    .update({ ...rest, website_url: website_url || null, logo_url: logo_url || null, updated_at: new Date().toISOString() })
    .eq('id', sponsorId)
    .eq('event_id', eventId)
  if (error) return { error: error.message }
  revalidatePath('/embedded/events/[eventId]/sponsors', 'page')
  return { ok: true }
}

export async function embedDeleteSponsor(sponsorId: string, eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { error } = await db
    .from('event_sponsors')
    .delete()
    .eq('id', sponsorId)
    .eq('event_id', eventId)
  if (error) return { error: error.message }
  revalidatePath('/embedded/events/[eventId]/sponsors', 'page')
  return { ok: true }
}

'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { catchPermission } from '@/lib/auth/permission-error'
import { logAudit } from '@/lib/audit/log'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const SponsorSchema = z.object({
  name: z.string().min(1).max(200),
  website_url: z.string().url().optional().or(z.literal('')),
  logo_url: z.string().url().optional().or(z.literal('')),
  tier: z.enum(['title', 'gold', 'silver', 'bronze']),
  sort_order: z.coerce.number().int().default(0),
  is_featured: z.coerce.boolean().default(false),
})

export async function getSponsors(eventId: string) {
  // Admin client: read sponsors across RLS for org admin view
  const admin = createAdminClient()
  const { data } = await admin
    .from('event_sponsors')
    .select('*')
    .eq('event_id', eventId)
    .order('tier')
    .order('sort_order')
    .order('created_at')
  return data ?? []
}

async function getSponsorContext(eventId: string) {
  const user = await requireUser()
  const admin = createAdminClient()
  const { data: event } = await admin.from('events').select('org_id').eq('id', eventId).single()
  if (!event) throw new Error('Event not found')
  return { admin, event, userId: user.id }
}

export async function createSponsor(eventId: string, formData: FormData) {
  const { admin, event, userId } = await getSponsorContext(eventId)
  try { await assertPermission(event.org_id, userId, 'sponsors.manage') } catch (e) { return catchPermission(e) }
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
  const { error } = await admin.from('event_sponsors').insert({
    event_id: eventId,
    ...rest,
    website_url: website_url || null,
    logo_url: logo_url || null,
  })
  if (error) return { error: error.message }
  await logAudit(admin, null, userId, 'sponsor.create', 'event_sponsors', eventId, { name: parsed.data.name })
  revalidatePath(`/events/[slug]/sponsors`, 'page')
  return { ok: true }
}

export async function updateSponsor(
  sponsorId: string,
  eventId: string,
  formData: FormData,
) {
  const { admin, event, userId } = await getSponsorContext(eventId)
  try { await assertPermission(event.org_id, userId, 'sponsors.manage') } catch (e) { return catchPermission(e) }
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
  const { error } = await admin
    .from('event_sponsors')
    .update({ ...rest, website_url: website_url || null, logo_url: logo_url || null, updated_at: new Date().toISOString() })
    .eq('id', sponsorId)
    .eq('event_id', eventId)
  if (error) return { error: error.message }
  await logAudit(admin, null, userId, 'sponsor.update', 'event_sponsors', sponsorId)
  revalidatePath(`/events/[slug]/sponsors`, 'page')
  return { ok: true }
}

export async function deleteSponsor(sponsorId: string, eventId: string) {
  const { admin, event, userId } = await getSponsorContext(eventId)
  try { await assertPermission(event.org_id, userId, 'sponsors.manage') } catch (e) { return catchPermission(e) }
  const { error } = await admin
    .from('event_sponsors')
    .delete()
    .eq('id', sponsorId)
    .eq('event_id', eventId)
  if (error) return { error: error.message }
  await logAudit(admin, null, userId, 'sponsor.delete', 'event_sponsors', sponsorId)
  revalidatePath(`/events/[slug]/sponsors`, 'page')
  return { ok: true }
}

'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { buildEventTag, GHL_LIFECYCLE_TAGS } from '@/lib/integrations/ghl/config'

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
  return { db, orgId: link.org_id, locationId: session.location_id }
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

// ── Announcements ─────────────────────────────────────────────────────────────

export async function embedGetAnnouncementsContext(eventId: string) {
  const { db, orgId, locationId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data: event } = await db
    .from('events')
    .select('slug, title')
    .eq('id', eventId)
    .single()
  if (!event) throw new Error('Event not found')

  const audienceTag = buildEventTag(event.slug)
  const ghlContactsUrl = `https://app.gohighlevel.com/v2/location/${locationId}/contacts/smart_list/All`

  return {
    eventSlug:     event.slug,
    eventTitle:    event.title,
    audienceTag,
    ghlContactsUrl,
    lifecycleTags: {
      confirmed: GHL_LIFECYCLE_TAGS.confirmed,
      checkedIn: GHL_LIFECYCLE_TAGS.checkedIn,
    },
  }
}

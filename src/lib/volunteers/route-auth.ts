import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPermission } from '@/lib/auth/assert-permission'

type VolunteerTarget = {
  volunteer: Record<string, any>
  event: { id: string; org_id: string; slug: string; title: string; start_at: string; timezone: string | null }
}

// O114: resolve the volunteer's event from the volunteer row itself, require the
// URL's event ref (slug or id) to name that same event, then require
// volunteers.manage on that event's org. Returns a response to send on refusal.
export async function resolveVolunteerTarget(
  eventRef: string,
  volunteerId: string,
  userId: string,
): Promise<VolunteerTarget | NextResponse> {
  const admin = createAdminClient()
  const { data: volunteer } = await admin
    .from('volunteers')
    .select('*')
    .eq('id', volunteerId)
    .maybeSingle()
  if (!volunteer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: event } = await admin
    .from('events')
    .select('id, org_id, slug, title, start_at, timezone')
    .eq('id', volunteer.event_id as string)
    .maybeSingle()
  if (!event || (event.id !== eventRef && event.slug !== eventRef)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    await assertPermission(event.org_id as string, userId, 'volunteers.manage')
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return { volunteer, event: event as VolunteerTarget['event'] }
}

import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveVolunteerTarget } from '@/lib/volunteers/route-auth'

// O132: the dashboard sends the event slug; resolveVolunteerTarget takes the
// event from the volunteer row, accepts the URL ref as that event's id or
// slug, and requires volunteers.manage on it. The delete is scoped to that
// event and a zero-row delete is an error, never a silent success.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; volunteerId: string }> }
) {
  const user = await requireUser()
  const { id: eventRef, volunteerId } = await params

  const target = await resolveVolunteerTarget(eventRef, volunteerId, user.id)
  if (target instanceof NextResponse) return target

  const admin = createAdminClient()
  const { data: deleted, error } = await admin
    .from('volunteers')
    .delete()
    .eq('id', volunteerId)
    .eq('event_id', target.event.id)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

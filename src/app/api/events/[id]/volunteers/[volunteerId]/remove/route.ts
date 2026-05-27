import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertOrgRole } from '@/lib/orgs/actions'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; volunteerId: string }> }
) {
  const user = await requireUser()
  const { id: eventId, volunteerId } = await params

  const admin = createAdminClient()

  // Verify the volunteer belongs to the event in the URL — prevents IDOR
  // where volunteerId from one event is replayed against another event's path.
  const { data: volunteer } = await admin
    .from('volunteers')
    .select('event_id')
    .eq('id', volunteerId)
    .maybeSingle()
  if (!volunteer || volunteer.event_id !== eventId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Resolve org and require staff+ membership.
  const { data: event } = await admin
    .from('events')
    .select('org_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const supabase = await createClient()
  try {
    await assertOrgRole(supabase, event.org_id as string, user.id, ['owner', 'admin', 'staff'])
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await admin.from('volunteers').delete().eq('id', volunteerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

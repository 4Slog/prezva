import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveVolunteerTarget } from '@/lib/volunteers/route-auth'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; volunteerId: string }> }
) {
  const user = await requireUser()
  const { id, volunteerId } = await params
  const target = await resolveVolunteerTarget(id, volunteerId, user.id)
  if (target instanceof NextResponse) return target

  // Admin client: update volunteer status, scoped to the volunteer's own event
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('volunteers')
    .update({ status: 'checked_in', clocked_in_at: new Date().toISOString() })
    .eq('id', volunteerId)
    .eq('event_id', target.event.id)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

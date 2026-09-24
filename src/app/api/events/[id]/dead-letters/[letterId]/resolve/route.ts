import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPermission } from '@/lib/auth/assert-permission'

// The item's event comes from the item row; the caller needs failed_jobs.manage
// on that event's org. The URL's event (id or slug — the dashboard sends the
// slug) must be that same event, and the write is filtered by it.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; letterId: string }> }
) {
  const user = await requireUser()
  const { id: eventRef, letterId } = await params
  const admin = createAdminClient()

  const { data: item } = await admin
    .from('dead_letter_items')
    .select('id, event_id')
    .eq('id', letterId)
    .maybeSingle()
  if (!item?.event_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: event } = await admin
    .from('events')
    .select('id, slug, org_id')
    .eq('id', item.event_id)
    .maybeSingle()
  if (!event || (eventRef !== event.id && eventRef !== event.slug)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    await assertPermission(event.org_id as string, user.id, 'failed_jobs.manage')
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: updated, error } = await admin
    .from('dead_letter_items')
    .update({ resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq('id', letterId)
    .eq('event_id', event.id)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

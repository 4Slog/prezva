import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPermission } from '@/lib/auth/assert-permission'

// Same shape as ../resolve: the item's event comes from the item row (an item
// with no event is refused); the caller needs failed_jobs.manage on that
// event's org; the URL's event (id or slug — the dashboard sends the slug)
// must be that same event.
//
// No job type can be re-run from here yet. The old check_in_sync "replay"
// self-POSTed a payload the check-in route always rejected and then reported
// "Replay attempted" — a fake success. Every type now gets an honest 422 and
// the item is left untouched; add a real handler per type when one exists.

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; letterId: string }> }
) {
  const user = await requireUser()
  const { id: eventRef, letterId } = await params
  const admin = createAdminClient()

  const { data: item } = await admin
    .from('dead_letter_items')
    .select('id, type, event_id')
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

  return NextResponse.json({ error: `Replay not supported for ${item.type}` }, { status: 422 })
}

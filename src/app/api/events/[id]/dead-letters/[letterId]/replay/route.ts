import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertOrgRole } from '@/lib/orgs/actions'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; letterId: string }> }
) {
  const user = await requireUser()
  const { id: eventId, letterId } = await params
  const admin = createAdminClient()

  // Verify the dead-letter item belongs to the event in the URL.
  const { data: item } = await admin
    .from('dead_letter_items')
    .select('*')
    .eq('id', letterId)
    .maybeSingle()

  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (item.event_id && item.event_id !== eventId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Require org staff+ on the event before allowing replay.
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

  // For check_in_sync type: re-attempt the sync via the check-in API
  if (item.type === 'check_in_sync') {
    const payload = item.payload as { registration_id?: string; event_id?: string }
    const eventId = item.event_id ?? payload.event_id
    if (payload.registration_id && eventId) {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/events/${eventId}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        await admin.from('dead_letter_items').update({ resolved_at: new Date().toISOString() }).eq('id', letterId)
        return NextResponse.json({ message: 'Replayed and resolved' })
      }
    }
  }

  // Generic: just mark retry_count incremented
  await admin
    .from('dead_letter_items')
    .update({ retry_count: item.retry_count + 1, last_failed_at: new Date().toISOString() })
    .eq('id', letterId)

  return NextResponse.json({ message: `Replay attempted (type: ${item.type})` })
}

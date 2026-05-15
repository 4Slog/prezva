import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  await requireUser()
  const { id } = await params
  // Admin client: read the dead-letter item to determine replay type
  const admin = createAdminClient()
  const { data: item } = await admin
    .from('dead_letter_items')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

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
        await admin.from('dead_letter_items').update({ resolved_at: new Date().toISOString() }).eq('id', id)
        return NextResponse.json({ message: 'Replayed and resolved' })
      }
    }
  }

  // Generic: just mark retry_count incremented
  await admin
    .from('dead_letter_items')
    .update({ retry_count: item.retry_count + 1, last_failed_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ message: `Replay attempted (type: ${item.type})` })
}

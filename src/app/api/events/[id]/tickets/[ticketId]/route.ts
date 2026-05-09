import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'

type Params = { params: Promise<{ id: string; ticketId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id: eventId, ticketId } = await params
    const user = await requireUser()
    const supabase = await createClient()

    const { data: event } = await supabase
      .from('events').select('org_id').eq('id', eventId).maybeSingle()
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: member } = await supabase
      .from('org_members').select('role')
      .eq('org_id', event.org_id).eq('user_id', user.id).maybeSingle()
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { count } = await supabase
      .from('registrations').select('*', { count: 'exact', head: true })
      .eq('ticket_type_id', ticketId).in('status', ['confirmed', 'pending'])

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Cannot delete ticket type with active registrations' },
        { status: 422 },
      )
    }

    const { error } = await supabase
      .from('ticket_types').delete().eq('id', ticketId).eq('event_id', eventId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return new NextResponse(null, { status: 204 })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

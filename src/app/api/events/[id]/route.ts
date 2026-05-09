import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { z } from 'zod'

const UpdateSchema = z.object({
  title:       z.string().min(2).max(120).optional(),
  description: z.string().max(5000).optional(),
  event_type:  z.enum(['in_person', 'virtual', 'hybrid']).optional(),
  timezone:    z.string().optional(),
  start_at:    z.string().datetime().optional(),
  end_at:      z.string().datetime().optional(),
  venue_name:    z.string().optional(),
  venue_address: z.string().optional(),
  venue_city:    z.string().optional(),
  venue_state:   z.string().optional(),
  virtual_url:   z.string().url().optional().or(z.literal('')),
  capacity:      z.number().int().min(1).optional(),
  waitlist_enabled:           z.boolean().optional(),
  allow_public_attendee_list: z.boolean().optional(),
  require_approval:           z.boolean().optional(),
  cover_image_url: z.string().url().optional().or(z.literal('')),
})

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:     ['published', 'cancelled'],
  published: ['live', 'cancelled'],
  live:      ['ended'],
  ended:     ['archived'],
  cancelled: [],
  archived:  [],
}

type Params = { params: Promise<{ id: string }> }

async function getMembership(supabase: Awaited<ReturnType<typeof createClient>>, eventId: string, userId: string) {
  const { data: event } = await supabase
    .from('events')
    .select('org_id, status')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) return null

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', event.org_id)
    .eq('user_id', userId)
    .maybeSingle()

  return member ? { ...member, org_id: event.org_id, event_status: event.status } : null
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const user = await requireUser()
    const supabase = await createClient()

    const m = await getMembership(supabase, id, user.id)
    if (!m) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })

    const { data, error } = await supabase.from('events').select('*').eq('id', id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const user = await requireUser()
    const supabase = await createClient()
    const body = await req.json()

    const m = await getMembership(supabase, id, user.id)
    if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!['owner', 'admin'].includes(m.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Handle status transition separately
    if (body.status) {
      const allowed = VALID_TRANSITIONS[m.event_status] ?? []
      if (!allowed.includes(body.status)) {
        return NextResponse.json(
          { error: `Cannot transition from '${m.event_status}' to '${body.status}'` },
          { status: 422 },
        )
      }
      const { error } = await supabase.from('events').update({ status: body.status }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const { data } = await supabase.from('events').select('*').eq('id', id).single()
      return NextResponse.json(data)
    }

    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('events')
      .update(parsed.data)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const user = await requireUser()
    const supabase = await createClient()

    const m = await getMembership(supabase, id, user.id)
    if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (m.role !== 'owner') {
      return NextResponse.json({ error: 'Only org owners can delete events' }, { status: 403 })
    }
    if (!['draft', 'cancelled'].includes(m.event_status)) {
      return NextResponse.json(
        { error: 'Only draft or cancelled events can be deleted' },
        { status: 422 },
      )
    }

    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return new NextResponse(null, { status: 204 })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

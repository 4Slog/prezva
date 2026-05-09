import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { z } from 'zod'

const CreateSchema = z.object({
  name:           z.string().min(1).max(80),
  description:    z.string().max(500).optional(),
  type:           z.enum(['free', 'paid', 'donation']).default('free'),
  price_cents:    z.number().int().min(0).default(0),
  quantity:       z.number().int().min(1).optional(),
  max_per_order:  z.number().int().min(1).max(100).default(10),
  sort_order:     z.number().int().default(0),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('ticket_types')
      .select('*')
      .eq('event_id', id)
      .order('sort_order', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: eventId } = await params
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

    const body = await req.json()
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    if (parsed.data.type === 'free') parsed.data.price_cents = 0

    const { data, error } = await supabase
      .from('ticket_types')
      .insert({ ...parsed.data, event_id: eventId })
      .select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

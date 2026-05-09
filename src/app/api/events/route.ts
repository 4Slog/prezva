import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { z } from 'zod'

const CreateSchema = z.object({
  org_id:      z.string().uuid(),
  title:       z.string().min(2).max(120),
  slug:        z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  description: z.string().max(5000).optional(),
  event_type:  z.enum(['in_person', 'virtual', 'hybrid']).default('in_person'),
  timezone:    z.string().default('America/Chicago'),
  start_at:    z.string().datetime(),
  end_at:      z.string().datetime(),
  venue_name:    z.string().optional(),
  venue_address: z.string().optional(),
  venue_city:    z.string().optional(),
  venue_state:   z.string().optional(),
  virtual_url:   z.string().url().optional().or(z.literal('')),
  capacity:         z.number().int().min(1).optional(),
  waitlist_enabled: z.boolean().default(false),
}).refine(d => new Date(d.end_at) > new Date(d.start_at), {
  message: 'end_at must be after start_at', path: ['end_at'],
})

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    const supabase = await createClient()
    const body = await req.json()

    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    // Membership check
    const { data: member } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', parsed.data.org_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Slug uniqueness
    const { data: existing } = await supabase
      .from('events')
      .select('id')
      .eq('org_id', parsed.data.org_id)
      .eq('slug', parsed.data.slug)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Slug already taken in this org' }, { status: 409 })
    }

    const { data: event, error } = await supabase
      .from('events')
      .insert({ ...parsed.data, created_by: user.id })
      .select()
      .single()

    if (error || !event) {
      return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })
    }

    return NextResponse.json(event, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()
    const supabase = await createClient()
    const { searchParams } = new URL(req.url)
    const orgId = searchParams.get('org_id')

    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const { data: member } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!member) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('events')
      .select('id, title, slug, status, event_type, start_at, end_at, registration_count, checked_in_count, venue_city, venue_state')
      .eq('org_id', orgId)
      .order('start_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

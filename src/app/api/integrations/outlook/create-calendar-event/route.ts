import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { outlookAdapter } from '@/lib/integrations/outlook/adapter'

export async function POST(req: NextRequest) {
  const user = await requireUser()
  const { orgId, eventId } = await req.json()
  if (!orgId || !eventId) return NextResponse.json({ error: 'orgId and eventId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: member } = await supabase.from('org_members').select('role').eq('org_id', orgId).eq('user_id', user.id).maybeSingle()
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!['owner', 'admin'].includes(member.role)) return NextResponse.json({ error: 'Forbidden — admin or owner role required' }, { status: 403 })

  const { data: event } = await supabase.from('events').select('title, starts_at, ends_at, description, location').eq('id', eventId).maybeSingle()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  await outlookAdapter.createCalendarEvent(orgId, {
    title: (event as any).title,
    starts_at: (event as any).starts_at,
    ends_at: (event as any).ends_at,
    description: (event as any).description,
    location: (event as any).location,
  })
  return NextResponse.json({ ok: true })
}

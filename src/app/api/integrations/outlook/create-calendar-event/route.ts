import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { guardEventInOrg, guardIntegrationOrg } from '@/lib/integrations/_shared/route-guard'
import { outlookAdapter } from '@/lib/integrations/outlook/adapter'

export async function POST(req: NextRequest) {
  const user = await requireUser()
  const { orgId, eventId } = await req.json()
  if (!orgId || !eventId) return NextResponse.json({ error: 'orgId and eventId required' }, { status: 400 })

  // O155: the adapter reads this org's token on the service-role client, so
  // the caller needs org.integrations on it.
  const org = await guardIntegrationOrg(orgId, user.id)
  if (!org.ok) return org.response
  const foreign = await guardEventInOrg(eventId, org.orgId)
  if (foreign) return foreign

  const supabase = await createClient()

  const { data: event } = await supabase.from('events').select('title, starts_at, ends_at, description, location').eq('id', eventId).maybeSingle()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  await outlookAdapter.createCalendarEvent(org.orgId, {
    title: (event as any).title,
    starts_at: (event as any).starts_at,
    ends_at: (event as any).ends_at,
    description: (event as any).description,
    location: (event as any).location,
  })
  return NextResponse.json({ ok: true })
}

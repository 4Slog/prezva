import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { eventbriteAdapter } from '@/lib/integrations/eventbrite/adapter'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  const orgId = req.nextUrl.searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: member } = await supabase.from('org_members').select('role').eq('org_id', orgId).eq('user_id', user.id).maybeSingle()
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const events = await eventbriteAdapter.listOrganizerEvents(orgId)
  return NextResponse.json({ events })
}

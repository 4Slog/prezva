import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { mailchimpAdapter } from '@/lib/integrations/mailchimp/adapter'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  await requireUser()
  const { orgId, eventId, listId } = await req.json()
  if (!orgId || !eventId || !listId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const supabase = await createClient()
  const { data } = await supabase
    .from('registrations')
    .select('email, first_name, last_name')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
  const members = (data ?? []).map(r => ({ email: r.email, firstName: r.first_name ?? undefined, lastName: r.last_name ?? undefined }))
  const result = await mailchimpAdapter.syncAudience(orgId, listId, members)
  return NextResponse.json(result)
}

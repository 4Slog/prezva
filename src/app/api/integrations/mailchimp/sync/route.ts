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
    .select('attendee_email, attendee_name')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
  const members = (data ?? []).map(r => {
    const parts = (r.attendee_name ?? '').trim().split(/\s+/)
    const firstName = parts[0] ?? ''
    const lastName = parts.slice(1).join(' ') || ''
    return { email: r.attendee_email, firstName, lastName }
  })
  const result = await mailchimpAdapter.syncAudience(orgId, listId, members)
  return NextResponse.json(result)
}

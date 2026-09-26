import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { mailchimpAdapter } from '@/lib/integrations/mailchimp/adapter'
import { guardEventInOrg, guardIntegrationOrg } from '@/lib/integrations/_shared/route-guard'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const user = await requireUser()
  const { orgId, eventId, listId } = await req.json()
  if (!orgId || !eventId || !listId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  // O155: org.integrations on the org, and the event must be that org's.
  const org = await guardIntegrationOrg(orgId, user.id)
  if (!org.ok) return org.response
  const foreign = await guardEventInOrg(eventId, org.orgId)
  if (foreign) return foreign

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('registrations')
    .select('attendee_email, attendee_name')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
  if (error) return NextResponse.json({ error: 'Could not load registrations.' }, { status: 500 })
  const members = (data ?? []).map(r => {
    const parts = (r.attendee_name ?? '').trim().split(/\s+/)
    const firstName = parts[0] ?? ''
    const lastName = parts.slice(1).join(' ') || ''
    return { email: r.attendee_email, firstName, lastName }
  })
  const result = await mailchimpAdapter.syncAudience(org.orgId, listId, members)
  return NextResponse.json(result)
}

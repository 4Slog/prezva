import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { eventbriteAdapter } from '@/lib/integrations/eventbrite/adapter'
import { guardEventInOrg, guardIntegrationOrg } from '@/lib/integrations/_shared/route-guard'

export async function POST(req: Request) {
  const user = await requireUser()
  const { orgId, eventbriteEventId, prezvaEventId } = await req.json()
  if (!orgId || !eventbriteEventId || !prezvaEventId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  // O155: org.integrations on the org, and the Prezva event must be that org's.
  const org = await guardIntegrationOrg(orgId, user.id)
  if (!org.ok) return org.response
  const foreign = await guardEventInOrg(prezvaEventId, org.orgId)
  if (foreign) return foreign

  const result = await eventbriteAdapter.importAttendees(org.orgId, eventbriteEventId, prezvaEventId)
  return NextResponse.json(result)
}

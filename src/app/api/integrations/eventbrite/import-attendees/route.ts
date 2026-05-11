import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { eventbriteAdapter } from '@/lib/integrations/eventbrite/adapter'

export async function POST(req: Request) {
  await requireUser()
  const { orgId, eventbriteEventId, prezvaEventId } = await req.json()
  if (!orgId || !eventbriteEventId || !prezvaEventId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const result = await eventbriteAdapter.importAttendees(orgId, eventbriteEventId, prezvaEventId)
  return NextResponse.json(result)
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { guardIntegrationOrg, guardSessionInOrg } from '@/lib/integrations/_shared/route-guard'
import { teamsAdapter } from '@/lib/integrations/teams/adapter'

export async function POST(req: NextRequest) {
  const user = await requireUser()
  const { orgId, sessionId } = await req.json()
  if (!orgId || !sessionId) return NextResponse.json({ error: 'orgId and sessionId required' }, { status: 400 })

  // O155: the adapter reads this org's token on the service-role client, so
  // the caller needs org.integrations on it.
  const org = await guardIntegrationOrg(orgId, user.id)
  if (!org.ok) return org.response
  const foreign = await guardSessionInOrg(sessionId, org.orgId)
  if (foreign) return foreign

  const supabase = await createClient()

  const { data: session } = await supabase.from('sessions').select('id, title, starts_at, ends_at').eq('id', sessionId).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const joinUrl = await teamsAdapter.createMeeting(org.orgId, session as any)
  if (!joinUrl) return NextResponse.json({ error: 'Failed to create Teams meeting' }, { status: 500 })

  await supabase.from('sessions').update({ virtual_url: joinUrl }).eq('id', sessionId)
  return NextResponse.json({ joinUrl })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { zoomAdapter } from '@/lib/integrations/zoom/adapter'

export async function POST(req: NextRequest) {
  const user = await requireUser()
  const { orgId, sessionId } = await req.json()
  if (!orgId || !sessionId) return NextResponse.json({ error: 'orgId and sessionId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: member } = await supabase.from('org_members').select('role').eq('org_id', orgId).eq('user_id', user.id).maybeSingle()
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!['owner', 'admin'].includes(member.role)) return NextResponse.json({ error: 'Forbidden — admin or owner role required' }, { status: 403 })

  const { data: session } = await supabase.from('sessions').select('id, title, starts_at, ends_at, description').eq('id', sessionId).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const joinUrl = await zoomAdapter.createMeeting(orgId, session as any)
  if (!joinUrl) return NextResponse.json({ error: 'Failed to create Zoom meeting' }, { status: 500 })

  await supabase.from('sessions').update({ virtual_url: joinUrl }).eq('id', sessionId)
  return NextResponse.json({ joinUrl })
}

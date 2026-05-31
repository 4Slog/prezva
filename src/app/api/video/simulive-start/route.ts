import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const user = await requireUser()

  let body: { sessionId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { sessionId } = body
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  const supabase = await createClient()

  // Verify caller is an org member for the event this session belongs to
  const { data: session } = await supabase
    .from('sessions')
    .select('id, event_id')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const { data: event } = await supabase
    .from('events')
    .select('org_id')
    .eq('id', (session as any).event_id)
    .maybeSingle()

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', (event as any).org_id)
    .eq('user_id', user.id)
    .maybeSingle()

  const ALLOWED_ROLES = ['owner', 'admin', 'organizer']
  if (!member || !ALLOWED_ROLES.includes((member as any).role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const startedAt = new Date().toISOString()

  const { error } = await supabase
    .from('sessions')
    .update({ simulive_started_at: startedAt } as any)
    .eq('id', sessionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, startedAt })
}

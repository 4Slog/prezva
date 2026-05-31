import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import { generateToken } from '@/lib/video/livekit'

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { sessionId } = body ?? {}
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, event_id, livekit_room_name, events!inner(id, status, org_id)')
    .eq('id', sessionId)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const event = Array.isArray(session.events) ? session.events[0] : session.events
  if (!event || event.status !== 'published') {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (!session.livekit_room_name) {
    return NextResponse.json({ error: 'Session has no live room configured' }, { status: 404 })
  }

  const roomName = session.livekit_room_name

  const { data: registration } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', session.event_id)
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .maybeSingle()

  if (!registration) {
    return NextResponse.json({ error: 'No confirmed registration' }, { status: 403 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, display_name')
    .eq('id', user.id)
    .maybeSingle()

  const displayName =
    (profile as { full_name?: string; display_name?: string } | null)?.display_name ||
    (profile as { full_name?: string; display_name?: string } | null)?.full_name ||
    user.email ||
    user.id

  const { data: membership } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', event.org_id)
    .eq('user_id', user.id)
    .maybeSingle()

  const isPublisher = !!membership

  const token = await generateToken(roomName, user.id, displayName, isPublisher)
  return NextResponse.json({ token })
}

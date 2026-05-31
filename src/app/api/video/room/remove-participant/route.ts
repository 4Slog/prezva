import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { roomName, participantIdentity } = body ?? {}
  if (!roomName || !participantIdentity) {
    return NextResponse.json({ error: 'roomName and participantIdentity are required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, event_id, events!inner(org_id)')
    .eq('livekit_room_name', roomName)
    .maybeSingle()

  if (!session) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }

  const event = Array.isArray(session.events) ? session.events[0] : session.events
  if (!event) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', (event as { org_id: string }).org_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Stub: wire LiveKit Admin API in Batch 6 cleanup
  return NextResponse.json({
    success: true,
    message: 'Remove participant not yet implemented — wire LiveKit API in Batch 6 cleanup',
  })
}

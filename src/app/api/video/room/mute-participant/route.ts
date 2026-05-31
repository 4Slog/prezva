import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import { muteParticipantTrack } from '@/lib/video/livekit'

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { roomName, participantIdentity, trackSid } = body ?? {}
  if (!roomName || !participantIdentity || !trackSid) {
    return NextResponse.json(
      { error: 'roomName, participantIdentity, and trackSid are required' },
      { status: 400 },
    )
  }

  const supabase = await createClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, events!inner(org_id)')
    .eq('livekit_room_name', roomName)
    .maybeSingle()

  if (!session) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  const event = Array.isArray(session.events) ? session.events[0] : session.events
  if (!event) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', (event as { org_id: string }).org_id)
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin', 'staff'])
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    await muteParticipantTrack(roomName, participantIdentity, trackSid)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[video] mutePublishedTrack failed:', err)
    return NextResponse.json({ error: 'Failed to mute participant' }, { status: 500 })
  }
}

import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { generateToken, createRoom } from '@/lib/video/livekit'
import Link from 'next/link'
import LiveRoom from '@/components/video/LiveRoom'
import { Avatar } from '@/components/identity/Avatar'
import { HandleTag } from '@/components/identity/HandleTag'

type Props = {
  params: Promise<{ slug: string; inviteId: string }>
}

export default async function MeetPage({ params }: Props) {
  const { slug, inviteId } = await params

  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title')
    .eq('slug', slug)
    .maybeSingle()
  if (!event) return notFound()

  const ev = event as { id: string; title: string }

  // Current user must have a confirmed registration for this event
  const { data: myReg } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', ev.id)
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .maybeSingle()
  if (!myReg) redirect(`/e/${slug}`)

  // inviteId is the other party's registrationId — verify they are also a confirmed registrant
  const { data: otherReg } = await supabase
    .from('registrations')
    .select('id')
    .eq('id', inviteId)
    .eq('event_id', ev.id)
    .eq('status', 'confirmed')
    .maybeSingle()
  if (!otherReg) return notFound()

  const myRegId = (myReg as { id: string }).id

  // Peer identity — inviteId is the OTHER party's registration_id, not the viewer's
  const { data: peerProfile } = await supabase
    .from('event_visible_profiles')
    .select('attendee_name, handle, avatar_url')
    .eq('registration_id', inviteId)
    .eq('event_id', ev.id)
    .maybeSingle()
  const peer = peerProfile as { attendee_name: string; handle: string | null; avatar_url: string | null } | null

  // Deterministic room name — same pair always gets the same room
  const roomName = `1on1-${[myRegId, inviteId].sort().join('-')}`

  // Ensure room exists (idempotent — safe to call on an existing room)
  await createRoom(roomName).catch(err =>
    console.error('[video] createRoom on meet page:', err),
  )

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, full_name')
    .eq('id', user.id)
    .maybeSingle()
  const displayName =
    (profile as { display_name?: string; full_name?: string } | null)?.display_name ||
    (profile as { display_name?: string; full_name?: string } | null)?.full_name ||
    user.email ||
    user.id

  // Mint a fresh token server-side — passed to LiveRoom via RSC props, never in a URL or log
  const token = await generateToken(roomName, user.id, displayName as string, true)

  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      // eslint-disable-next-line no-restricted-syntax -- full-screen video-room theater bg — pure black matches the LiveKit room aesthetic
      background: '#000',
      overflow: 'hidden',
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.625rem 1rem',
        background: 'var(--color-navy)',
        flexShrink: 0,
        gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 11, color: 'var(--color-teal)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ev.title}
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-chrome-text)', margin: 0 }}>
            Private video chat
          </p>
          {peer && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Avatar name={peer.attendee_name} avatarUrl={peer.avatar_url} size={20} />
              <span style={{ fontSize: 12, color: 'var(--pz-chrome-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {peer.attendee_name}
              </span>
              <HandleTag handle={peer.handle} />
            </div>
          )}
        </div>
        <Link
          href={`/e/${slug}/people`}
          style={{
            flexShrink: 0,
            padding: '6px 14px',
            borderRadius: 6,
            background: 'var(--pz-error)',
            color: 'var(--pz-chrome-text)',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Leave
        </Link>
      </div>

      {/* Video fills remaining viewport */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <LiveRoom
          roomName={roomName}
          directToken={token}
          participantName={displayName as string}
          isOrganizer={true}
        />
      </div>
    </div>
  )
}

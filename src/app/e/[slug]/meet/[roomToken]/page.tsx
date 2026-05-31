import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import LiveRoom from '@/components/video/LiveRoom'

type Props = {
  params: Promise<{ slug: string; roomToken: string }>
}

function decodeJwt(token: string): { sub?: string; video?: { room?: string } } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8')
    return JSON.parse(payload)
  } catch {
    return null
  }
}

export default async function MeetPage({ params }: Props) {
  const { slug, roomToken } = await params

  const user = await requireUser()

  const claims = decodeJwt(roomToken)
  if (!claims) return notFound()

  const roomName = claims.video?.room
  const participantIdentity = claims.sub

  if (!roomName || !participantIdentity) return notFound()

  // Prevent token sharing — this token was issued for this user only
  if (participantIdentity !== user.id) {
    redirect(`/e/${slug}/people`)
  }

  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title')
    .eq('slug', slug)
    .maybeSingle()
  if (!event) return notFound()

  const { data: registration } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', (event as { id: string; title: string }).id)
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .maybeSingle()
  if (!registration) redirect(`/e/${slug}`)

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

  const ev = event as { id: string; title: string }

  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
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
          <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>
            Private video chat
          </p>
        </div>
        <Link
          href={`/e/${slug}/people`}
          style={{
            flexShrink: 0,
            padding: '6px 14px',
            borderRadius: 6,
            background: '#ef4444',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Leave
        </Link>
      </div>

      {/* Video — fills remaining viewport */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <LiveRoom
          roomName={roomName}
          directToken={roomToken}
          participantName={displayName as string}
          isOrganizer={true}
        />
      </div>
    </div>
  )
}

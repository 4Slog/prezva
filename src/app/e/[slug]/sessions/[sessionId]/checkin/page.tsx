import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import { SessionSelfCheckIn } from './session-self-checkin'

type Props = { params: Promise<{ slug: string; sessionId: string }> }

export default async function SessionSelfCheckInPage({ params }: Props) {
  const { slug, sessionId } = await params
  const user = await getUser()
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, title, starts_at, ends_at, rooms(name), events!inner(id, title, slug)')
    .eq('id', sessionId)
    .single()

  if (!session || (session as any).events?.slug !== slug) notFound()

  const ev = (session as any).events

  // Look up user's registration for this event
  let registrationId: string | null = null
  if (user) {
    const { data: reg } = await supabase
      .from('registrations')
      .select('id')
      .eq('event_id', ev.id)
      .eq('attendee_email', user.email ?? '')
      .neq('status', 'cancelled')
      .single()
    registrationId = reg?.id ?? null
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div className="text-center mb-6">
          <p className="text-xs mb-1" style={{ color: 'var(--pz-muted)' }}>{ev.title}</p>
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--pz-text)' }}>{(session as any).title}</h1>
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
            {fmtTime((session as any).starts_at)} – {fmtTime((session as any).ends_at)}
            {(session as any).rooms?.name && ` · ${(session as any).rooms.name}`}
          </p>
        </div>
        <SessionSelfCheckIn
          eventId={ev.id}
          sessionId={sessionId}
          userId={user?.id ?? null}
          registrationId={registrationId}
          userEmail={user?.email ?? null}
          eventSlug={slug}
        />
      </div>
    </div>
  )
}

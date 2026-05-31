import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { checkEligibility } from '@/lib/certificates/eligibility'
import Link from 'next/link'
import { Radio } from 'lucide-react'
import LivePageClient from './LivePageClient'

type Props = {
  params: Promise<{ slug: string; sessionId: string }>
}

export default async function LiveSessionPage({ params }: Props) {
  const { slug, sessionId } = await params

  const user = await requireUser()
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('sessions')
    .select(`
      id, title, description, starts_at, ends_at, ce_credit_hours,
      mux_playback_id, mux_stream_id, livekit_room_name,
      slides_url, recording_url, is_published, event_id
    `)
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || !session.is_published) notFound()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, slug, timezone, certificate_min_session_attendance_pct, org_id')
    .eq('id', session.event_id)
    .maybeSingle()

  if (!event) notFound()

  const { data: registration } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', session.event_id)
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .maybeSingle()

  if (!registration) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 8 }}>Registration required</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 20 }}>
            You need a confirmed registration for this event to watch the live session.
          </p>
          <Link href={`/e/${slug}`} style={{ color: 'var(--color-teal)', fontSize: 14 }}>View event →</Link>
        </div>
      </div>
    )
  }

  const eligibility = await checkEligibility(registration.id)

  const { data: orgMember } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', (event as any).org_id)
    .eq('user_id', user.id)
    .maybeSingle()
  const isOrganizer = !!orgMember

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, display_name')
    .eq('id', user.id)
    .maybeSingle()

  const displayName =
    (profile as any)?.display_name ||
    (profile as any)?.full_name ||
    user.email ||
    user.id

  const isLive = !!session.mux_stream_id

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Header */}
      <div className="live-page-header" style={{ background: 'var(--color-navy)', color: '#fff', padding: '1rem 1.5rem' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <Link href={`/e/${slug}`} style={{ color: 'var(--color-teal)', fontSize: 12, textDecoration: 'none' }}>
            ← {event.title}
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 800, margin: 0 }}>{session.title}</h1>
            {isLive && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#ef4444', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
                <Radio size={11} /> LIVE
              </span>
            )}
          </div>
          {eligibility && (
            <p className="live-page-attendance" style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
              {eligibility.sessionsAttended}/{eligibility.sessionsTotal} sessions attended
              {(session.ce_credit_hours ?? 0) > 0 && ` · ${session.ce_credit_hours} CE credit${(session.ce_credit_hours ?? 0) !== 1 ? 's' : ''} available`}
            </p>
          )}
        </div>
      </div>
      <style>{`
        @media (max-width: 768px) {
          .live-page-header { padding: 0.5rem 1rem !important; }
          .live-page-header h1 { font-size: 1rem !important; }
          .live-page-attendance { display: none; }
        }
      `}</style>

      {/* Main content */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '1.5rem 1.5rem' }}>
        <LivePageClient
          session={{
            id: session.id,
            title: session.title,
            description: session.description,
            ce_credit_hours: session.ce_credit_hours,
            mux_playback_id: session.mux_playback_id,
            mux_stream_id: session.mux_stream_id,
            livekit_room_name: session.livekit_room_name ?? null,
            starts_at: session.starts_at,
            ends_at: session.ends_at,
            slides_url: (session as any).slides_url ?? null,
            recording_url: (session as any).recording_url ?? null,
          }}
          event={{ id: event.id, title: event.title, slug: event.slug }}
          registrationId={registration.id}
          userId={user.id}
          displayName={displayName}
          isOrganizer={isOrganizer}
        />
      </div>
    </div>
  )
}

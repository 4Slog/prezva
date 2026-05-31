import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import { getAttendeeProfile, getVirtualCardData, getFollowStatus } from '@/lib/networking/sprint8-actions'
import { ProfileActions } from './profile-actions'
import VCardQR from '@/components/networking/VCardQR'
import { MeetingResponsePanel } from '@/components/networking/MeetingResponsePanel'

type Props = { params: Promise<{ slug: string; registrationId: string }> }

export default async function AttendeePage({ params }: Props) {
  const { slug, registrationId } = await params
  const user = await getUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events').select('id, title').eq('slug', slug).single()
  if (!event) notFound()

  const { data: reg } = await supabase
    .from('registrations')
    .select('id, attendee_name, attendee_email, ticket_types(name)')
    .eq('id', registrationId)
    .eq('event_id', (event as any).id)
    .single()
  if (!reg) notFound()

  const [profile, cardData] = await Promise.all([
    getAttendeeProfile(registrationId),
    getVirtualCardData(registrationId),
  ])

  if (!profile || !(profile as any).is_visible) notFound()

  const isOwnProfile = user && (profile as any).user_id === user.id

  let followStatus = { following: false }
  let incomingMeetingRequest: any = null
  if (user && !isOwnProfile && (profile as any).user_id) {
    const [fs, mr] = await Promise.all([
      getFollowStatus((event as any).id, (profile as any).user_id),
      supabase.from('meeting_requests')
        .select('id, status, message, proposed_times')
        .eq('event_id', (event as any).id)
        .eq('requester_id', (profile as any).user_id)
        .eq('recipient_id', user.id)
        .eq('status', 'pending')
        .maybeSingle(),
    ])
    followStatus = fs
    incomingMeetingRequest = mr.data ?? null
  }

  const p = profile as any
  const r = reg as any

  // Generate vCard QR URL via external service
  const vCardData = cardData ? [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${(cardData as any).name}`,
    `EMAIL:${(cardData as any).email}`,
    (cardData as any).company ? `ORG:${(cardData as any).company}` : '',
    (cardData as any).job_title ? `TITLE:${(cardData as any).job_title}` : '',
    (cardData as any).website_url ? `URL:${(cardData as any).website_url}` : '',
    'END:VCARD',
  ].filter(Boolean).join('\n') : null

  // vCardData ready — rendered client-side via VCardQR (no external service)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <a href={`/e/${slug}/people`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>← People</a>
        </div>
      </div>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div className="pz-card p-6 mb-6">
          <div className="flex items-start gap-4 mb-4">
            <div
              className="rounded-full flex items-center justify-center text-lg font-bold shrink-0"
              style={{ width: 64, height: 64, background: p.avatar_url ? undefined : 'var(--pz-teal)', color: '#0D1B2A', overflow: 'hidden' }}
            >
              {p.avatar_url ? (
                <img src={p.avatar_url} alt={r.attendee_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : r.attendee_name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold mb-0.5" style={{ color: 'var(--pz-text)' }}>{r.attendee_name}</h1>
              {(p.job_title || p.company) && (
                <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
                  {[p.job_title, p.company].filter(Boolean).join(' · ')}
                </p>
              )}
              <p className="text-xs mt-1" style={{ color: 'var(--pz-muted)' }}>{r.ticket_types?.name}</p>
            </div>
          </div>

          {p.bio && (
            <p className="text-sm mb-4" style={{ color: 'var(--pz-text)', lineHeight: 1.6 }}>{p.bio}</p>
          )}

          {p.interests?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {p.interests.map((interest: string) => (
                <span key={interest} className="rounded-full px-3 py-1 text-xs" style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}>
                  {interest}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="text-sm" style={{ color: 'var(--pz-teal)' }}>LinkedIn →</a>}
            {p.twitter_url && <a href={p.twitter_url} target="_blank" rel="noreferrer" className="text-sm" style={{ color: 'var(--pz-teal)' }}>Twitter →</a>}
            {p.website_url && <a href={p.website_url} target="_blank" rel="noreferrer" className="text-sm" style={{ color: 'var(--pz-teal)' }}>Website →</a>}
          </div>

          {user && !isOwnProfile && (
            <ProfileActions
              eventId={(event as any).id}
              eventSlug={slug}
              targetUserId={p.user_id}
              targetName={r.attendee_name}
              registrationId={registrationId}
              isFollowing={followStatus.following}
            />
          )}
          {incomingMeetingRequest && (
            <MeetingResponsePanel
              requestId={incomingMeetingRequest.id}
              requesterName={r.attendee_name}
              message={incomingMeetingRequest.message}
              proposedTimes={incomingMeetingRequest.proposed_times ?? []}
              initialStatus={incomingMeetingRequest.status}
            />
          )}
          {isOwnProfile && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--pz-border)' }}>
              <a href={`/e/${slug}/profile/edit`} className="text-sm" style={{ color: 'var(--pz-teal)' }}>Edit your profile →</a>
            </div>
          )}
        </div>

        {/* Virtual business card (T-093) */}
        {vCardData && (
          <div className="pz-card p-5">
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--pz-label)' }}>Virtual business card</h2>
            <div className="flex items-start gap-4">
              <VCardQR data={vCardData} />
              <div className="text-xs space-y-1" style={{ color: 'var(--pz-muted)' }}>
                <p className="font-semibold text-sm" style={{ color: 'var(--pz-text)' }}>{(cardData as any).name}</p>
                {(cardData as any).job_title && <p>{(cardData as any).job_title}</p>}
                {(cardData as any).company && <p>{(cardData as any).company}</p>}
                <p>{(cardData as any).email}</p>
                <p className="mt-2 text-xs" style={{ color: 'var(--pz-muted)' }}>Scan QR to save contact</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

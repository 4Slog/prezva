import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import { getAttendeeProfile, getVirtualCardData, getFollowStatus } from '@/lib/networking/sprint8-actions'
import { ProfileActions } from './profile-actions'
import VCardQR from '@/components/networking/VCardQR'
import { MeetingResponsePanel } from '@/components/networking/MeetingResponsePanel'
import { HandleTag } from '@/components/identity/HandleTag'

type Props = { params: Promise<{ slug: string; registrationId: string }> }

export default async function AttendeePage({ params }: Props) {
  const { slug, registrationId } = await params
  const user = await getUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events').select('id, title').eq('slug', slug).single()
  if (!event) notFound()
  const eventId = (event as any).id

  // Try own-profile read first (own-only RLS — returns data only for the viewer's own registration)
  const ownProfile = await getAttendeeProfile(registrationId)

  if (ownProfile) {
    // ── OWN PROFILE PATH ─────────────────────────────────────────────────────
    // is_visible=false still renders for the owner; no ProfileActions / vCard for self
    const { data: reg } = await supabase
      .from('registrations')
      .select('id, attendee_name, attendee_email, ticket_types(name)')
      .eq('id', registrationId)
      .eq('event_id', eventId)
      .single()
    if (!reg) notFound()

    let ownHandle: string | null = null
    if (user) {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('handle')
        .eq('id', user.id)
        .maybeSingle()
      ownHandle = (profileRow as any)?.handle ?? null
    }

    const cardData = await getVirtualCardData(registrationId)
    const p = ownProfile as any
    const r = reg as any

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
                style={{ width: 64, height: 64, background: p.avatar_url ? undefined : 'var(--pz-teal)', color: 'var(--pz-on-accent)', overflow: 'hidden' }}
              >
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt={r.attendee_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : r.attendee_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold mb-0.5" style={{ color: 'var(--pz-text)' }}>{r.attendee_name}</h1>
                <HandleTag handle={ownHandle} />
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
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--pz-border)' }}>
              <a href={`/e/${slug}/profile/edit`} className="text-sm" style={{ color: 'var(--pz-teal)' }}>Edit your profile →</a>
            </div>
          </div>

          {vCardData && (
            <div className="pz-card p-5">
              <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--pz-label)' }}>Virtual business card</h2>
              <div className="flex items-start gap-4">
                <VCardQR data={vCardData} />
                <div className="text-xs space-y-1" style={{ color: 'var(--pz-muted)' }}>
                  <p className="font-semibold text-sm" style={{ color: 'var(--pz-text)' }}>{(cardData as any).name}</p>
                  <HandleTag handle={ownHandle} />
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

  // ── OTHERS PATH ──────────────────────────────────────────────────────────────
  // View enforces is_visible=true + is_registered; empty result → notFound()
  const { data: viewRow } = await supabase
    .from('event_visible_profiles')
    .select('id, registration_id, event_id, user_id, attendee_name, handle, company, job_title, bio, interests, avatar_url, linkedin_url, twitter_url, website_url, ticket_name, created_at, email')
    .eq('registration_id', registrationId)
    .eq('event_id', eventId)
    .single()

  if (!viewRow) notFound()

  const p = viewRow as any

  let followStatus = { following: false }
  let incomingMeetingRequest: any = null
  if (user && p.user_id) {
    const [fs, mr] = await Promise.all([
      getFollowStatus(eventId, p.user_id),
      supabase.from('meeting_requests')
        .select('id, status, message, proposed_times')
        .eq('event_id', eventId)
        .eq('requester_id', p.user_id)
        .eq('recipient_id', user.id)
        .eq('status', 'pending')
        .maybeSingle(),
    ])
    followStatus = fs
    incomingMeetingRequest = mr.data ?? null
  }

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
              style={{ width: 64, height: 64, background: p.avatar_url ? undefined : 'var(--pz-teal)', color: 'var(--pz-on-accent)', overflow: 'hidden' }}
            >
              {p.avatar_url ? (
                <img src={p.avatar_url} alt={p.attendee_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : p.attendee_name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold mb-0.5" style={{ color: 'var(--pz-text)' }}>{p.attendee_name}</h1>
              <HandleTag handle={p.handle} />
              {(p.job_title || p.company) && (
                <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
                  {[p.job_title, p.company].filter(Boolean).join(' · ')}
                </p>
              )}
              <p className="text-xs mt-1" style={{ color: 'var(--pz-muted)' }}>{p.ticket_name}</p>
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
            {p.email && <a href={`mailto:${p.email}`} className="text-sm" style={{ color: 'var(--pz-teal)' }}>Email →</a>}
            {p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="text-sm" style={{ color: 'var(--pz-teal)' }}>LinkedIn →</a>}
            {p.twitter_url && <a href={p.twitter_url} target="_blank" rel="noreferrer" className="text-sm" style={{ color: 'var(--pz-teal)' }}>Twitter →</a>}
            {p.website_url && <a href={p.website_url} target="_blank" rel="noreferrer" className="text-sm" style={{ color: 'var(--pz-teal)' }}>Website →</a>}
          </div>
          {user && p.user_id && (
            <ProfileActions
              eventId={eventId}
              eventSlug={slug}
              targetUserId={p.user_id}
              targetName={p.attendee_name}
              registrationId={registrationId}
              isFollowing={followStatus.following}
            />
          )}
          {incomingMeetingRequest && (
            <MeetingResponsePanel
              requestId={incomingMeetingRequest.id}
              requesterName={p.attendee_name}
              message={incomingMeetingRequest.message}
              proposedTimes={incomingMeetingRequest.proposed_times ?? []}
              initialStatus={incomingMeetingRequest.status}
            />
          )}
        </div>
        {/* No virtual business card for other attendees — email/qr omitted intentionally */}
      </div>
    </div>
  )
}

import { requireEventOrgAccess } from '@/lib/auth/require-event-access'
import { getAttendeeDirectory, getSuggestedConnectionsByInterest } from '@/lib/messaging/actions'
import NetworkingClient from './client'
import Link from 'next/link'

export default async function NetworkingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { event, user } = await requireEventOrgAccess(slug)

  const [attendees, suggestions] = await Promise.all([
    getAttendeeDirectory(event.id) as Promise<any[]>,
    getSuggestedConnectionsByInterest(event.id) as Promise<any[]>,
  ])

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Networking</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 4 }}>Connect with other attendees</p>
        </div>
        <Link href={`/e/${slug}/profile/edit`} style={{ fontSize: 13, color: 'var(--pz-teal-ink)', textDecoration: 'none' }}>
          Update my profile →
        </Link>
      </div>

      {suggestions.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>People you might want to meet</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {suggestions.map((s: any) => (
              <div key={s.registration_id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 12px', background: 'var(--color-surface)', minWidth: 150 }}>
                <p style={{ fontWeight: 600, fontSize: 13 }}>{s.attendee_name}</p>
                {s.profiles?.job_title && <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{s.profiles.job_title}</p>}
                {s.interests.slice(0, 2).map((i: string) => (
                  <span key={i} style={{ display: 'inline-block', fontSize: 10, background: 'var(--pz-teal-bg)', color: 'var(--pz-teal-ink)', borderRadius: 4, padding: '1px 6px', marginRight: 4, marginTop: 4 }}>{i}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <NetworkingClient attendees={attendees} eventId={event.id} currentUserId={user.id} />
    </div>
  )
}

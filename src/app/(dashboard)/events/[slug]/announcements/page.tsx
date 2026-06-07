import { requireEventOrgAccess } from '@/lib/auth/require-event-access'
import { getOrgPermissions } from '@/lib/auth/assert-permission'
import { getAnnouncements } from '@/lib/announcements/actions'
import AnnouncementsClient from './client'

export default async function AnnouncementsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { user, event } = await requireEventOrgAccess(slug)
  const [announcements, permSet] = await Promise.all([
    getAnnouncements(event.id),
    getOrgPermissions(event.org_id, user.id),
  ])
  const permissions = Array.from(permSet)
  return (
    <div style={{ padding: '2rem', maxWidth: 800 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Announcements</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 4 }}>Send email or push notifications to attendees</p>
      </div>
      <AnnouncementsClient announcements={announcements} eventId={event.id} slug={slug} orgId={event.org_id} permissions={permissions} />
    </div>
  )
}

import { requireAdmin } from '@/lib/admin/gate'
import { AnnouncementForm } from './announcement-form'

export default async function AnnouncementsPage() {
  await requireAdmin()
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--pz-text)]">Platform Announcements</h1>
        <p className="text-sm text-[var(--pz-muted)] mt-1">Send an email to all organization owners on the platform.</p>
      </div>
      <AnnouncementForm />
    </div>
  )
}

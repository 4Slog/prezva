import { requireEventOrgAccess } from '@/lib/auth/require-event-access'
import { BadgeNewClient } from './client'

type Props = { params: Promise<{ slug: string }> }

export default async function NewBadgeTemplatePage({ params }: Props) {
  const { slug } = await params
  const { event } = await requireEventOrgAccess(slug)

  return (
    <BadgeNewClient
      eventId={event.id}
      eventTitle={event.title}
      orgId={event.org_id}
      eventSlug={slug}
    />
  )
}

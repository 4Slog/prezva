import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { embedCreateBadgeTemplate } from '@/lib/embedded/badges-actions'
import { BadgeNewClient } from '@/app/(dashboard)/events/[slug]/badges/new/client'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedBadgeNewPage({ params }: Props) {
  const { eventId } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  let session: Awaited<ReturnType<typeof verifyEmbeddedSession>>
  try {
    session = await verifyEmbeddedSession(token)
  } catch {
    redirect('/embedded/events')
  }

  const db = createAdminClient()

  const { data: link } = await db
    .from('ghl_location_links')
    .select('org_id')
    .eq('ghl_location_id', session.location_id)
    .maybeSingle()
  if (!link) redirect('/embedded/events')

  const { data: event } = await db
    .from('events')
    .select('id, title, org_id, slug')
    .eq('id', eventId)
    .eq('org_id', link.org_id)
    .maybeSingle()
  if (!event) redirect('/embedded/events')

  return (
    <BadgeNewClient
      eventId={(event as any).id}
      eventTitle={(event as any).title}
      orgId={(event as any).org_id}
      eventSlug={(event as any).slug}
      embed={{
        createTemplate: embedCreateBadgeTemplate,
        backHref: `/embedded/events/${eventId}/badges`,
      }}
    />
  )
}

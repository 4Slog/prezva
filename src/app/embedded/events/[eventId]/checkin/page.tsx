import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCheckInStats } from '@/lib/embedded/checkin-actions'
import { EmbedCheckInClient } from './client'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedCheckInPage({ params }: Props) {
  const { eventId } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  let orgId: string
  try {
    const session = await verifyEmbeddedSession(token)
    const db = createAdminClient()
    const { data: link } = await db
      .from('ghl_location_links')
      .select('org_id')
      .eq('ghl_location_id', session.location_id)
      .maybeSingle()
    if (!link) redirect('/embedded/events')
    orgId = link.org_id
  } catch {
    redirect('/embedded/events')
  }

  const db = createAdminClient()
  const { data: event } = await db
    .from('events')
    .select('id, title, org_id, slug')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!event) redirect('/embedded/events')

  const initialStats = await getCheckInStats(eventId)

  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const arrivalUrl = `${BASE_URL}/e/${(event as any).slug}/self-checkin`

  return (
    <EmbedCheckInClient
        eventId={eventId}
        eventName={(event as any).title}
        initialStats={initialStats}
        arrivalUrl={arrivalUrl}
      />
  )
}

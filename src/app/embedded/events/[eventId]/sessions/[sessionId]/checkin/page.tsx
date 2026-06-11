import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { embedGetSessionCheckInAttendees } from '@/lib/embedded/checkin-actions'
import EmbedSessionCheckInClient from './client'

interface Props {
  params: Promise<{ eventId: string; sessionId: string }>
}

export default async function EmbedSessionCheckInPage({ params }: Props) {
  const { eventId, sessionId } = await params

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

  // IDOR: event must belong to org
  const { data: event } = await db
    .from('events')
    .select('id, org_id')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!event) redirect('/embedded/events')

  // IDOR: session must belong to event
  const { data: sessionRow } = await db
    .from('sessions')
    .select('id, title, session_qr_token')
    .eq('id', sessionId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (!sessionRow) notFound()

  const attendees = await embedGetSessionCheckInAttendees(eventId, sessionId)

  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const sessionUrl = `${BASE_URL}/session-checkin/${(sessionRow as any).session_qr_token}`

  return (
    <div className="p-6">
      <EmbedSessionCheckInClient
        eventId={eventId}
        sessionId={sessionId}
        sessionTitle={(sessionRow as any).title}
        sessionUrl={sessionUrl}
        initialAttendees={attendees}
      />
    </div>
  )
}

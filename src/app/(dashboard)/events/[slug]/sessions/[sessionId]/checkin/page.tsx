import { notFound } from 'next/navigation'
import { requireEventOrgAccess } from '@/lib/auth/require-event-access'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionCheckInAttendees } from '@/lib/checkin/actions'
import SessionCheckInClient from './client'
import Link from 'next/link'

type Props = { params: Promise<{ slug: string; sessionId: string }> }

export default async function SessionCheckInPage({ params }: Props) {
  const { slug, sessionId } = await params

  let access: Awaited<ReturnType<typeof requireEventOrgAccess>>
  try {
    access = await requireEventOrgAccess(slug)
  } catch {
    notFound()
  }

  const supabase = await createClient()
  const { data: session } = await supabase
    .from('sessions')
    .select('id, title')
    .eq('id', sessionId)
    .eq('event_id', access!.event.id)
    .maybeSingle()

  if (!session) notFound()

  // The QR token is service-role only (0157); the caller already has access to
  // this event, and the read is pinned to this session on this event.
  const { data: qr } = await createAdminClient()
    .from('sessions')
    .select('session_qr_token')
    .eq('id', session.id)
    .eq('event_id', access!.event.id)
    .maybeSingle()
  if (!qr?.session_qr_token) notFound()

  const attendees = await getSessionCheckInAttendees(access!.event.id, sessionId)

  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const sessionUrl = `${BASE_URL}/session-checkin/${qr.session_qr_token}`

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/events/${slug}`} className="text-sm" style={{ color: 'var(--pz-muted)' }}>
          ← {access!.event.title}
        </Link>
        <span style={{ color: 'var(--pz-border)' }}>/</span>
        <span className="text-sm" style={{ color: 'var(--pz-muted)' }}>{(session as any).title}</span>
        <span style={{ color: 'var(--pz-border)' }}>/</span>
        <span className="text-sm" style={{ color: 'var(--pz-text)' }}>Check-in</span>
      </div>
      <SessionCheckInClient
        eventId={access!.event.id}
        sessionId={(session as any).id}
        sessionTitle={(session as any).title}
        sessionUrl={sessionUrl}
        initialAttendees={attendees}
        staffUserId={access!.user.id}
      />
    </div>
  )
}

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionIdentity } from '@/lib/auth/session-identity'
import SelfCheckInWithPin from '@/components/checkin/SelfCheckInWithPin'

type Props = { params: Promise<{ slug: string }> }

export default async function EventSelfCheckInPage({ params }: Props) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: event } = await admin
    .from('events')
    .select('id, title, slug')
    .eq('slug', slug)
    .maybeSingle()

  if (!event) notFound()

  const identity = await getSessionIdentity(slug)
  let registrationId: string | undefined

  if (identity.type === 'user') {
    const { data: reg } = await admin
      .from('registrations')
      .select('id')
      .eq('event_id', (event as any).id)
      .eq('user_id', identity.userId)
      .eq('status', 'confirmed')
      .maybeSingle()
    registrationId = reg?.id ?? undefined
  } else if (identity.type === 'registration' && identity.eventId === (event as any).id) {
    registrationId = identity.registrationId
  }

  return (
    <SelfCheckInWithPin
      scope="event"
      eventId={(event as any).id}
      eventTitle={(event as any).title}
      registrationId={registrationId}
    />
  )
}

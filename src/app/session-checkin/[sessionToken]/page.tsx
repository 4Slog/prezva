import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { resolveOwnedRegistration } from '@/lib/auth/owned-registration'
import SelfCheckInWithPin from '@/components/checkin/SelfCheckInWithPin'

type Props = { params: Promise<{ sessionToken: string }> }

export default async function SessionSelfCheckInPage({ params }: Props) {
  const { sessionToken } = await params
  const admin = createAdminClient()

  const { data: session } = await admin
    .from('sessions')
    .select('id, title, event_id, events(id, title, slug)')
    .eq('session_qr_token', sessionToken)
    .maybeSingle()

  if (!session) notFound()

  const event = (session as any).events as { id: string; title: string; slug: string } | null
  if (!event) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let registrationId: string | undefined

  if (user) {
    // Same ownership rule selfCheckInRegistration enforces (user_id, else verified email).
    const reg = await resolveOwnedRegistration({ type: 'user', userId: user.id }, event.id)
    registrationId = reg?.id ?? undefined
  }

  return (
    <SelfCheckInWithPin
      scope="session"
      eventId={event.id}
      eventTitle={event.title}
      sessionId={(session as any).id}
      sessionTitle={(session as any).title}
      registrationId={registrationId}
    />
  )
}

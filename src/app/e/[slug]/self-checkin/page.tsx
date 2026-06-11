import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let registrationId: string | undefined

  if (user) {
    const { data: reg } = await admin
      .from('registrations')
      .select('id')
      .eq('event_id', (event as any).id)
      .eq('user_id', user.id)
      .eq('status', 'confirmed')
      .maybeSingle()
    registrationId = reg?.id ?? undefined
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

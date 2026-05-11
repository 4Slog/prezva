import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getSpeakerConversations, getSpeakersWithMissingInfo } from '@/lib/speaker/speaker-actions'
import { SpeakerMessagesClient } from './speaker-messages-client'

type Props = { params: Promise<{ slug: string }> }

export default async function SpeakerMessagesPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, org_id')
    .eq('slug', slug)
    .single()
  if (!event) notFound()

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', (event as any).org_id)
    .eq('user_id', user.id)
    .single()
  if (!member) redirect('/dashboard')

  const eventId = (event as any).id
  const conversations = await getSpeakerConversations(eventId)

  const { data: speakers } = await supabase
    .from('speakers')
    .select('id, name, email, status')
    .eq('event_id', eventId)

  return (
    <SpeakerMessagesClient
      event={event as any}
      conversations={conversations}
      speakers={(speakers ?? []) as any[]}
      eventSlug={slug}
    />
  )
}

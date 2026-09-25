import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getOrgPermissions, permits } from '@/lib/auth/assert-permission'
import { withSpeakerEmails } from '@/lib/speaker/speaker-emails'
import { getSpeakerConversations } from '@/lib/speaker/speaker-portal-data'
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

  const [{ data: speakerRows }, permSet] = await Promise.all([
    supabase
      .from('speakers')
      .select('id, name, status')
      .eq('event_id', eventId),
    getOrgPermissions(event.org_id, user.id),
  ])

  // Speaker email is service-only (0158): organizers who can see speakers get
  // it. A failed read shows the list without emails rather than failing.
  let speakers: Array<{ id: string; name: string; status: string; email?: string | null }> = speakerRows ?? []
  if (permits(permSet, 'speakers.view') || permits(permSet, 'speakers.manage')) {
    try { speakers = await withSpeakerEmails(eventId, speakers) } catch (e) { console.error('[speaker messages] email read failed', (e as Error).message) }
  }

  return (
    <SpeakerMessagesClient
      event={event as any}
      conversations={conversations}
      speakers={(speakers ?? []) as any[]}
      eventSlug={slug}
    />
  )
}

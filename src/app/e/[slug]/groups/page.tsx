import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getGroupConversations } from '@/lib/networking/sprint8-group-actions'
import { GroupsClient } from './groups-client'

type Props = { params: Promise<{ slug: string }> }

export default async function GroupsPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events').select('id, title').eq('slug', slug).single()
  if (!event) notFound()

  const eventId = (event as any).id
  const conversations = await getGroupConversations(eventId)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <a href={`/e/${slug}`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>← {(event as any).title}</a>
        </div>
      </div>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>Group Chats</h1>
        </div>
        <GroupsClient
          eventSlug={slug}
          eventId={eventId}
          userId={user.id}
          initialConversations={conversations}
        />
      </div>
    </div>
  )
}

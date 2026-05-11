import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import { getCommunityPosts } from '@/lib/networking/sprint8-actions'
import { CommunityClient } from './community-client'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ type?: string }> }

export default async function CommunityPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { type } = await searchParams
  const user = await getUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events').select('id, title').eq('slug', slug).single()
  if (!event) notFound()

  const eventId = (event as any).id
  const posts = await getCommunityPosts(eventId, type)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href={`/e/${slug}`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>← {(event as any).title}</a>
        </div>
      </div>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--pz-text)' }}>Community</h1>
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>Share updates, schedule meetups, and connect with fellow attendees.</p>
        </div>
        <CommunityClient
          eventSlug={slug}
          eventId={eventId}
          userId={user?.id ?? null}
          initialPosts={posts}
          initialType={type ?? ''}
        />
      </div>
    </div>
  )
}

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPhotoEntries } from '@/lib/engagement/sprint10-actions'
import { PhotosClient } from './photos-client'

type Props = { params: Promise<{ slug: string }> }

export default async function PhotoContestPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: event } = await supabase.from('events').select('id, title').eq('slug', slug).single()
  if (!event) notFound()

  const entries = await getPhotoEntries((event as any).id)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const publicEntries = entries.map((e: any) => ({
    ...e,
    url: `${supabaseUrl}/storage/v1/object/public/event-photos/${e.storage_path}`,
  }))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <a href={`/e/${slug}`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>← {(event as any).title}</a>
            <h1 style={{ fontWeight: 800, fontSize: '1.25rem', marginTop: '0.5rem', color: 'var(--pz-text)' }}>Photo Contest</h1>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1.5rem' }}>
        <PhotosClient eventId={(event as any).id} eventSlug={slug} initialEntries={publicEntries} />
      </div>
    </div>
  )
}

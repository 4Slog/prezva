import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPassportLocations, getPassportVisits } from '@/lib/engagement/sprint10-actions'
import { PassportClient } from './passport-client'

type Props = { params: Promise<{ slug: string }> }

export default async function PassportPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: event } = await supabase.from('events').select('id, title').eq('slug', slug).single()
  if (!event) notFound()

  const [locations, visitedIds] = await Promise.all([
    getPassportLocations((event as any).id),
    getPassportVisits((event as any).id),
  ])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: 500, margin: '0 auto' }}>
          <a href={`/e/${slug}`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>← {(event as any).title}</a>
          <h1 style={{ fontWeight: 800, fontSize: '1.25rem', marginTop: '0.5rem', color: 'var(--pz-text)' }}>Passport</h1>
          <p style={{ fontSize: 13, color: 'var(--pz-muted)', marginTop: 4 }}>Visit sponsor booths and enter their codes to earn points.</p>
        </div>
      </div>
      <div style={{ maxWidth: 500, margin: '2rem auto', padding: '0 1.5rem' }}>
        <PassportClient
          eventId={(event as any).id}
          locations={locations}
          initialVisitedIds={visitedIds}
        />
      </div>
    </div>
  )
}

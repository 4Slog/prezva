import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getIcebreakerQuestions } from '@/lib/engagement/sprint10-actions'
import { IcebreakersClient } from './icebreakers-client'

type Props = { params: Promise<{ slug: string }> }

export default async function IcebreakersPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: event } = await supabase.from('events').select('id, title').eq('slug', slug).single()
  if (!event) notFound()

  const questions = await getIcebreakerQuestions((event as any).id)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <a href={`/e/${slug}`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>← {(event as any).title}</a>
          <h1 style={{ fontWeight: 800, fontSize: '1.25rem', marginTop: '0.5rem', color: 'var(--pz-text)' }}>Icebreakers</h1>
          <p style={{ fontSize: 13, color: 'var(--pz-muted)', marginTop: 4 }}>Answer prompts to earn points and spark conversations.</p>
        </div>
      </div>
      <div style={{ maxWidth: 600, margin: '2rem auto', padding: '0 1.5rem' }}>
        <IcebreakersClient questions={questions} eventId={(event as any).id} />
      </div>
    </div>
  )
}

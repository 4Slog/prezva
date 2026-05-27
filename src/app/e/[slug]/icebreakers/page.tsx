import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getIcebreakerQuestions } from '@/lib/engagement/sprint10-actions'
import { IcebreakersClient } from './icebreakers-client'
import { createAdminClient } from '@/lib/supabase/admin'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ preview?: string }>
}

export default async function IcebreakersPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { preview } = await searchParams
  const supabase = await createClient()

  const { data: event } = await supabase.from('events').select('id, title, org_id').eq('slug', slug).single()
  if (!event) notFound()

  let questions = await getIcebreakerQuestions((event as any).id)

  // If preview mode and no active questions — show all questions for org members
  if (questions.length === 0 && preview === '1') {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const admin = createAdminClient()
      const { data: member } = await admin.from('org_members')
        .select('role').eq('org_id', (event as any).org_id).eq('user_id', user.id).maybeSingle()
      if (member) {
        const { data: all } = await admin.from('icebreaker_questions')
          .select('id, question, question_text, prompt, category, is_active')
          .eq('event_id', (event as any).id)
        questions = (all ?? []) as any[]
      }
    }
  }

  // Resolve {event_title} merge tag at read time
  const eventTitle = (event as any).title as string
  questions = questions.map((q: any) => ({
    ...q,
    question: typeof q.question === 'string' ? q.question.replaceAll('{event_title}', eventTitle) : q.question,
    question_text: typeof q.question_text === 'string' ? q.question_text.replaceAll('{event_title}', eventTitle) : q.question_text,
    prompt: typeof q.prompt === 'string' ? q.prompt.replaceAll('{event_title}', eventTitle) : q.prompt,
  }))

  const isPreview = preview === '1' && questions.some((q: any) => !q.is_active)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      {isPreview && (
        <div style={{ background: '#F59E0B', color: '#0D1B2A', textAlign: 'center', padding: '8px', fontSize: 13, fontWeight: 600 }}>
          Preview mode — questions are not yet published to attendees
        </div>
      )}
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

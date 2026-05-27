import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { IcebreakersAdminClient } from './client'

type Props = { params: Promise<{ slug: string }> }

export default async function IcebreakersAdminPage({ params }: Props) {
  const { slug } = await params
  await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, org_id')
    .eq('slug', slug)
    .single()
  if (!event) notFound()

  const { data: rawQuestions } = await supabase
    .from('icebreaker_questions')
    .select('id, question, question_text, prompt, category, is_active')
    .eq('event_id', (event as any).id)
    .limit(100)

  // Resolve {event_title} merge tag at read time so prompts stay current
  const eventTitle = (event as any).title as string
  const questions = (rawQuestions ?? []).map((q: any) => ({
    ...q,
    question: typeof q.question === 'string' ? q.question.replaceAll('{event_title}', eventTitle) : q.question,
    question_text: typeof q.question_text === 'string' ? q.question_text.replaceAll('{event_title}', eventTitle) : q.question_text,
    prompt: typeof q.prompt === 'string' ? q.prompt.replaceAll('{event_title}', eventTitle) : q.prompt,
  }))

  const isActive = questions.some((q: any) => q.is_active)

  return (
    <div style={{ padding: '2rem', maxWidth: 800 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--pz-text)' }}>Icebreakers</h1>
        <p style={{ color: 'var(--pz-muted)', fontSize: 14, marginTop: 4 }}>
          Prompts attendees answer to spark conversations and earn points
        </p>
      </div>
      <IcebreakersAdminClient
          eventSlug={slug}
        questions={(questions ?? []) as any[]}
        eventId={(event as any).id}
        orgId={(event as any).org_id}
        isActive={isActive}
      />
    </div>
  )
}

import { requireEventOrgAccess } from '@/lib/auth/require-event-access'
import { createClient } from '@/lib/supabase/server'
import { IcebreakersAdminClient } from './client'

type Props = { params: Promise<{ slug: string }> }

export default async function IcebreakersAdminPage({ params }: Props) {
  const { slug } = await params
  const { event } = await requireEventOrgAccess(slug)
  const supabase = await createClient()

  const { data: rawQuestions } = await supabase
    .from('icebreaker_questions')
    .select('id, question, question_text, prompt, category, is_active')
    .eq('event_id', event.id)
    .limit(100)

  // Resolve {event_title} merge tag at read time so prompts stay current
  const eventTitle = event.title
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
        eventId={event.id}
        orgId={event.org_id}
        isActive={isActive}
      />
    </div>
  )
}

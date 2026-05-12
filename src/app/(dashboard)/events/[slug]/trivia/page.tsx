import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { getTriviaQuestions } from '@/lib/engagement/sprint10-actions'
import { TriviaAdminClient } from './client'

type Props = { params: Promise<{ slug: string }> }

export default async function TriviaAdminPage({ params }: Props) {
  const { slug } = await params
  await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, org_id')
    .eq('slug', slug)
    .single()
  if (!event) notFound()

  const questions = await getTriviaQuestions((event as any).id)

  return (
    <div style={{ padding: '2rem', maxWidth: 800 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--pz-text)' }}>Trivia</h1>
        <p style={{ color: 'var(--pz-muted)', fontSize: 14, marginTop: 4 }}>
          Multiple-choice questions attendees answer for points
        </p>
      </div>
      <TriviaAdminClient
        questions={questions as any[]}
        eventId={(event as any).id}
        orgId={(event as any).org_id}
      />
    </div>
  )
}

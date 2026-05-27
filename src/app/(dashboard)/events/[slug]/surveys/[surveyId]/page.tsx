import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import SurveyQuestionsClient from './client'

type Props = { params: Promise<{ slug: string; surveyId: string }> }

export default async function SurveyDetailPage({ params }: Props) {
  const { slug, surveyId } = await params
  const user = await requireUser()

  // Admin client: survey_questions RLS gates anon/non-staff reads. We verify
  // org membership ourselves below before exposing edit controls.
  const admin = createAdminClient()

  const { data: event } = await admin
    .from('events')
    .select('id, title, org_id')
    .eq('slug', slug)
    .maybeSingle()
  if (!event) notFound()

  const { data: member } = await admin
    .from('org_members')
    .select('role')
    .eq('org_id', (event as any).org_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member || !['owner', 'admin', 'staff'].includes((member as any).role)) {
    redirect('/dashboard')
  }

  const { data: survey } = await admin
    .from('surveys')
    .select('id, title, description, status, event_id')
    .eq('id', surveyId)
    .maybeSingle()
  if (!survey || (survey as any).event_id !== (event as any).id) notFound()

  const { data: questions } = await admin
    .from('survey_questions')
    .select('id, question_text, question_type, options, is_required, sort_order')
    .eq('survey_id', surveyId)
    .order('sort_order', { ascending: true })

  return (
    <div style={{ padding: '2rem', maxWidth: 800 }}>
      <SurveyQuestionsClient
        survey={survey as any}
        questions={(questions ?? []) as any}
        slug={slug}
      />
    </div>
  )
}

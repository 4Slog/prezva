import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { SurveyGuestForm } from '@/components/surveys/SurveyGuestForm'

export default async function PublicSurveyPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { id } = await params
  const { token } = await searchParams

  // Admin client: surveys RLS only allows staff or registered attendees. This
  // route is the public response page, so we bypass RLS and gate access by
  // survey status (active only) and—for inserts—the qr_code token.
  const admin = createAdminClient()

  const { data: survey } = await admin.from('surveys').select('id, title, description, status').eq('id', id).maybeSingle()
  if (!survey || survey.status !== 'active') notFound()

  const { data: questions } = await admin
    .from('survey_questions')
    .select('id, question_text, question_type, options, is_required, sort_order')
    .eq('survey_id', id)
    .order('sort_order', { ascending: true })

  return (
    <main className="min-h-screen bg-[var(--pz-bg)] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="mb-6">
          <img src="/icons/icon-192.png" alt="Prezva" className="w-10 h-10 mb-4" />
          <h1 className="text-2xl font-bold text-[var(--pz-text)]">{survey.title}</h1>
          {survey.description && <p className="text-sm text-[var(--pz-muted)] mt-1">{survey.description}</p>}
        </div>
        <SurveyGuestForm surveyId={id} token={token} questions={questions ?? []} />
      </div>
    </main>
  )
}

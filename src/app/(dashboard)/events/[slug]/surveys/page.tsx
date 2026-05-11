import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { getSurveys } from '@/lib/surveys/actions'
import SurveysClient from './client'

export default async function SurveysPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await requireUser()
  const supabase = await createClient()
  const { data: event } = await supabase.from('events').select('id,title').eq('slug', slug).single()
  if (!event) notFound()
  const surveys = await getSurveys(event.id)
  return (
    <div style={{ padding: '2rem', maxWidth: 800 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Surveys</h1>
        <p style={{ color: 'var(--pz-muted)', fontSize: 14, marginTop: 4 }}>Collect post-event feedback from attendees</p>
      </div>
      <SurveysClient surveys={surveys} eventId={event.id} slug={slug} />
    </div>
  )
}

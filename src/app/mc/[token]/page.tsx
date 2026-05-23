import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { MCHubClient } from './mc-hub-client'

type Props = { params: Promise<{ token: string }> }

export default async function MCHubPage({ params }: Props) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: event } = await admin
    .from('events')
    .select('id, title, slug, status, start_at, timezone, org_id')
    .eq('mc_token', token)
    .single()

  if (!event) notFound()

  const eventId = (event as any).id

  const { data: rosItems } = await admin
    .from('run_of_show_items')
    .select('*')
    .eq('event_id', eventId)
    .order('time_at', { ascending: true })

  const { data: sessions } = await admin
    .from('sessions')
    .select('id, title, starts_at, ends_at, description, type, rooms(name), session_speakers(role, speakers(id, name, job_title, company, bio, photo_url, event_role))')
    .eq('event_id', eventId)
    .order('starts_at', { ascending: true })

  const sessionIds = ((sessions ?? []) as any[]).map(s => s.id)
  let qaQuestions: any[] = []
  if (sessionIds.length > 0) {
    const { data: qa } = await admin
      .from('trivia_questions')
      .select('id, body, question_text, session_id, is_pinned, is_hidden, organizer_answer, created_at')
      .in('session_id', sessionIds)
      .eq('is_poll', false)
      .eq('is_active', true)
      .eq('is_hidden', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20)
    qaQuestions = (qa ?? []) as any[]
  }

  return (
    <MCHubClient
      event={event as any}
      rosItems={(rosItems ?? []) as any[]}
      sessions={(sessions ?? []) as any[]}
      qaQuestions={qaQuestions}
      token={token}
    />
  )
}

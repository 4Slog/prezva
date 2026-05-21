import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { SpeakersOrgClient } from './speakers-org-client'
import { DayOfInfoSection } from './day-of-info-section'
import { QAModerationClient } from './qa-moderation-client'

type Props = { params: Promise<{ slug: string }> }

export default async function SpeakersDashboardPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, org_id, slug, speaker_day_of_info')
    .eq('slug', slug)
    .single()
  if (!event) notFound()

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', (event as any).org_id)
    .eq('user_id', user.id)
    .single()
  if (!member) redirect('/dashboard')

  const admin = createAdminClient()

  const [{ data: speakers }, { data: qaQuestions }] = await Promise.all([
    supabase
      .from('speakers')
      .select('id, name, email, bio, photo_url, job_title, company, status, confirmed_at, confirmation_token, is_published, decline_reason, checked_in_at')
      .eq('event_id', (event as any).id)
      .order('sort_order', { ascending: true }),
    admin
      .from('session_questions')
      .select('id, session_id, body, upvote_count, is_hidden, is_pinned, organizer_answer, created_at, sessions(title)')
      .eq('event_id', (event as any).id)
      .eq('is_poll', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--pz-text)' }}>Speakers</h1>
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>{(event as any).title}</p>
        </div>
        <a
          href={`/events/${slug}/speakers/messages`}
          className="rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-text)' }}
        >
          Messages
        </a>
      </div>
      <SpeakersOrgClient
        event={event as any}
        speakers={(speakers ?? []) as any[]}
      />
      <DayOfInfoSection
        eventId={(event as any).id}
        initialValue={(event as any).speaker_day_of_info ?? ''}
      />
      <div className="mt-8">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>
          Q&A Moderation
        </h2>
        <QAModerationClient
          eventId={(event as any).id}
          initialQuestions={(qaQuestions ?? []) as any[]}
        />
      </div>
    </div>
  )
}

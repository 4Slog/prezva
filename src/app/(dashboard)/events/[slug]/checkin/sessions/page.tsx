import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { SessionCheckInClient } from './session-checkin-client'

type Props = { params: Promise<{ slug: string }> }

export default async function SessionCheckInPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events').select('id, title, org_id').eq('slug', slug).single()
  if (!event) notFound()

  const { data: member } = await supabase
    .from('org_members').select('role')
    .eq('org_id', (event as any).org_id).eq('user_id', user.id).single()
  if (!member) notFound()

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, title, starts_at')
    .eq('event_id', (event as any).id)
    .order('starts_at', { ascending: true })

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <p className="text-xs mb-1" style={{ color: 'var(--pz-muted)' }}>
          <a href={`/events/${slug}/checkin`} style={{ color: 'var(--pz-muted)' }}>← Check-in</a>
        </p>
        <h1 className="text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Session Check-in</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--pz-muted)' }}>Track attendance per session.</p>
      </div>
      {(sessions ?? []).length === 0 ? (
        <div className="pz-card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>No sessions found for this event.</p>
        </div>
      ) : (
        <SessionCheckInClient
          eventId={(event as any).id}
          sessions={(sessions ?? []).map((s: any) => ({ id: s.id, title: s.title, starts_at: s.starts_at }))}
        />
      )}
    </div>
  )
}

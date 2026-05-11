import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FeedbackClient } from './feedback-client'

type Props = { params: Promise<{ slug: string; sessionId: string }> }

export default async function SessionFeedbackPage({ params }: Props) {
  const { slug, sessionId } = await params
  const supabase = await createClient()

  const { data: event } = await supabase.from('events').select('id, title').eq('slug', slug).single()
  if (!event) notFound()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, title')
    .eq('id', sessionId)
    .single()
  if (!session) notFound()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="pz-card p-8 w-full" style={{ maxWidth: 480 }}>
        <a href={`/e/${slug}/agenda`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>← Back to agenda</a>
        <h1 style={{ fontWeight: 700, fontSize: '1.125rem', marginTop: 12, marginBottom: 4, color: 'var(--pz-text)' }}>
          Rate this session
        </h1>
        <p style={{ fontSize: 13, color: 'var(--pz-muted)', marginBottom: 20 }}>{(session as any).title}</p>
        <FeedbackClient sessionId={sessionId} eventId={(event as any).id} eventSlug={slug} />
      </div>
    </div>
  )
}

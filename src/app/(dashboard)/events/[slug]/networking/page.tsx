import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { getAttendeeDirectory } from '@/lib/messaging/actions'
import NetworkingClient from './client'

export default async function NetworkingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()
  const { data: event } = await supabase.from('events').select('id,title').eq('slug', slug).single()
  if (!event) notFound()
  const attendees = await getAttendeeDirectory(event.id) as any[]
  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Networking</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 4 }}>Connect with other attendees</p>
      </div>
      <NetworkingClient attendees={attendees} eventId={event.id} currentUserId={user.id} />
    </div>
  )
}

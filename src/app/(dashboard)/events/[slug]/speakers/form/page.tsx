import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getSpeakerFormSchema } from '@/lib/speaker/speaker-actions'
import { SpeakerFormBuilderClient } from './speaker-form-builder-client'

type Props = { params: Promise<{ slug: string }> }

export default async function SpeakerFormBuilderPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, org_id')
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

  const schema = await getSpeakerFormSchema((event as any).id)

  return (
    <div className="p-6">
      <div className="mb-6">
        <a href={`/events/${slug}/speakers`} className="text-sm" style={{ color: 'var(--pz-teal)' }}>← Speakers</a>
        <h1 className="text-xl font-bold mt-2 mb-1" style={{ color: 'var(--pz-text)' }}>Speaker Info Form</h1>
        <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>Configure what information to collect from speakers.</p>
      </div>
      <SpeakerFormBuilderClient eventId={(event as any).id} initialSchema={schema} />
    </div>
  )
}

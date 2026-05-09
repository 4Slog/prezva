import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RegisterPageClient } from './client'

type Props = { params: Promise<{ slug: string }> }

export default async function RegisterPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, slug, status, start_at, end_at, timezone, venue_name, venue_city, venue_state, organizations(name)')
    .eq('slug', slug)
    .in('status', ['published', 'live'])
    .maybeSingle()

  if (!event) notFound()

  const { data: tickets } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('event_id', event.id)
    .eq('is_active', true)
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })

  return (
    <RegisterPageClient
      event={event as unknown as Parameters<typeof RegisterPageClient>[0]["event"]}
      tickets={(tickets ?? []) as Parameters<typeof RegisterPageClient>[0]['tickets']}
    />
  )
}

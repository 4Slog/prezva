import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { BadgeNewClient } from './client'

type Props = { params: Promise<{ slug: string }> }

export default async function NewBadgeTemplatePage({ params }: Props) {
  const { slug } = await params
  await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, org_id')
    .eq('slug', slug)
    .single()
  if (!event) notFound()

  return (
    <BadgeNewClient
      eventId={(event as any).id}
      eventTitle={(event as any).title}
      orgId={(event as any).org_id}
      eventSlug={slug}
    />
  )
}

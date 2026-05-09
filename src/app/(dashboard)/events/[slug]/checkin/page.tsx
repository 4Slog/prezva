import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getCheckInStats } from '@/lib/checkin/actions'
import { CheckInClient } from './client'

interface Props { params: Promise<{ slug: string }> }

export default async function CheckInPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events').select('id, name, slug, org_id').eq('slug', slug).single()
  if (!event) notFound()

  const { data: member } = await supabase
    .from('org_members').select('role')
    .eq('org_id', (event as any).org_id).eq('user_id', user.id).single()
  if (!member) notFound()

  const initialStats = await getCheckInStats((event as any).id)

  return (
    <div className="p-6">
      <CheckInClient
        eventId={(event as any).id}
        eventName={(event as any).name}
        initialStats={initialStats}
      />
    </div>
  )
}

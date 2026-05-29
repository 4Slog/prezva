import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'

export interface EventOrgAccess {
  user: Awaited<ReturnType<typeof requireUser>>
  event: { id: string; title: string; slug: string; org_id: string }
  role: string
}

export async function requireEventOrgAccess(slug: string): Promise<EventOrgAccess> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data: event } = await supabase
    .from('events')
    .select('id, title, slug, org_id')
    .eq('slug', slug)
    .single()
  if (!event) notFound()
  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', (event as { org_id: string }).org_id)
    .eq('user_id', user.id)
    .single()
  if (!member) notFound()
  return { user, event: event as EventOrgAccess['event'], role: (member as { role: string }).role }
}

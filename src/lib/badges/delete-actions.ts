'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'

export async function deleteEventTemplate(
  templateId: string,
  eventId: string,
): Promise<{ success?: boolean; error?: string }> {
  const user = await requireUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()

  // Resolve event → org
  const { data: ev } = await supabase
    .from('events')
    .select('org_id')
    .eq('id', eventId)
    .single()
  if (!ev) return { error: 'Event not found' }

  // Explicit role gate: staff+ required (admin client bypasses RLS so this check is mandatory)
  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', (ev as any).org_id)
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin', 'staff'])
    .maybeSingle()
  if (!member) return { error: 'Access denied' }

  const admin = createAdminClient()
  const { error, count } = await admin
    .from('badge_templates')
    .delete({ count: 'exact' })
    .eq('id', templateId)
    .eq('event_id', eventId)
  if (error) return { error: error.message }
  if (count === 0) return { error: 'Delete failed — no rows affected' }

  revalidatePath(`/events`)
  return { success: true }
}

export async function deleteOrgTemplate(
  templateId: string,
  orgId: string,
): Promise<{ success?: boolean; error?: string }> {
  const user = await requireUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()

  // Explicit role gate: staff+ required
  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin', 'staff'])
    .maybeSingle()
  if (!member) return { error: 'Access denied' }

  const admin = createAdminClient()
  const { error, count } = await admin
    .from('badge_templates')
    .delete({ count: 'exact' })
    .eq('id', templateId)
    .eq('org_id', orgId)
    .is('event_id', null)
  if (error) return { error: error.message }
  if (count === 0) return { error: 'Delete failed — no rows affected' }

  revalidatePath(`/events`)
  return { success: true }
}

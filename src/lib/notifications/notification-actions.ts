'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'

export async function getNotifications(limit = 20) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('user_notifications')
    .select('id, type, title, body, url, is_read, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []) as any[]
}

export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { count } = await supabase
    .from('user_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false)

  return count ?? 0
}

export async function markRead(notificationId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await supabase
    .from('user_notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', user.id)
  return { ok: true }
}

export async function markAllRead() {
  const user = await requireUser()
  const supabase = await createClient()
  await supabase
    .from('user_notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false)
  return { ok: true }
}

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body?: string,
  url?: string,
) {
  const admin = createAdminClient()
  await admin.from('user_notifications').insert({ user_id: userId, type, title, body, url })
}

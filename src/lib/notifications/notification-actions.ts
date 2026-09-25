'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'

export interface UserNotification {
  id: string
  type: string
  title: string
  body: string | null
  url: string | null
  is_read: boolean
  created_at: string
}

// Every function here acts on the signed-in user's own rows: the user id comes
// from the session, and RLS (0155) enforces the same thing underneath.

export async function getNotifications(limit = 20): Promise<UserNotification[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('user_notifications')
    .select('id, type, title, body, url, is_read, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) console.error(`[notifications] list failed: ${error.message}`)

  return (data ?? []) as UserNotification[]
}

export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { count, error } = await supabase
    .from('user_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false)
  if (error) console.error(`[notifications] unread count failed: ${error.message}`)

  return count ?? 0
}

export async function markRead(notificationId: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from('user_notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', user.id)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function markAllRead(): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from('user_notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false)
  if (error) return { error: error.message }
  return { ok: true }
}

// createNotification moved to ./create-notification — it is admin-only and must
// stay importable from runtimes that have no next/headers. See that file.

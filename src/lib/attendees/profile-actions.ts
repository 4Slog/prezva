'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface UserProfileRow {
  user_id: string
  display_name?: string | null
  photo_url?: string | null
  bio?: string | null
  interests?: string[]
  pronouns?: string | null
  linkedin_url?: string | null
  twitter_url?: string | null
  website_url?: string | null
  show_in_directory?: boolean
  created_at?: string
  updated_at?: string
}

export async function getUserProfile(): Promise<UserProfileRow | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle()
  return data as UserProfileRow | null
}

export async function upsertUserProfile(updates: Partial<UserProfileRow>): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.from('user_profiles').upsert({
    user_id: user.id,
    ...updates,
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }
  revalidatePath('/me/profile')
  return {}
}

export async function getMyRegistrations() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('registrations')
    .select('id, status, qr_code, created_at, ticket_types(name, price_cents), events(id, title, slug, start_at, end_at, timezone, venue_name, virtual_url, status)')
    .eq('user_id', user.id)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })

  return (data ?? []) as any[]
}

export async function getMyNotifications() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Get events the user is registered for
  const { data: regData } = await supabase
    .from('registrations')
    .select('event_id')
    .eq('user_id', user.id)
  const eventIds = (regData ?? []).map((r: any) => r.event_id)
  if (!eventIds.length) return []

  const { data } = await supabase
    .from('announcements')
    .select('id, title, body, channel, sent_at, events(title, slug)')
    .in('event_id', eventIds)
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(50)

  return (data ?? []) as any[]
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface AttendeePreferences {
  user_id: string
  email_announcements: boolean
  email_reminders: boolean
  email_surveys: boolean
  email_marketing: boolean
  push_announcements: boolean
  push_reminders: boolean
  networking_show_in_dir: boolean
  networking_accept_matches: boolean
  networking_allow_dms: boolean
}

const DEFAULTS: Omit<AttendeePreferences, 'user_id'> = {
  email_announcements: true,
  email_reminders: true,
  email_surveys: true,
  email_marketing: false,
  push_announcements: true,
  push_reminders: true,
  networking_show_in_dir: true,
  networking_accept_matches: true,
  networking_allow_dms: true,
}

export async function getMyPreferences(): Promise<AttendeePreferences | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('attendee_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data) return { user_id: user.id, ...DEFAULTS }
  return data as AttendeePreferences
}

export async function updateMyPreferences(updates: Partial<Omit<AttendeePreferences, 'user_id'>>): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.from('attendee_preferences').upsert({
    user_id: user.id,
    ...updates,
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }
  revalidatePath('/me/preferences')
  return {}
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { revalidatePath } from 'next/cache'

export interface Conversation {
  id: string
  event_id: string
  participant_a: string
  participant_b: string
  last_message_at: string | null
  created_at: string
  other_user?: { id: string; full_name: string | null; email: string; avatar_url: string | null; job_title: string | null; company: string | null }
  last_message?: string | null
  unread_count?: number
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  status: string
  created_at: string
}

export async function getOrCreateConversation(eventId: string, otherUserId: string) {
  const supabase = await createClient()
  const user = await requireUser()

  // Check if recipient has disabled DMs — default allow, block only if explicitly false
  const { data: recipientPref } = await supabase
    .from('attendee_preferences')
    .select('networking_allow_dms')
    .eq('user_id', otherUserId)
    .maybeSingle()
  if (recipientPref && (recipientPref as any).networking_allow_dms === false) {
    return { error: 'This attendee has disabled direct messages.' }
  }

  // Check existing
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('event_id', eventId)
    .or(`and(participant_a.eq.${user.id},participant_b.eq.${otherUserId}),and(participant_a.eq.${otherUserId},participant_b.eq.${user.id})`)
    .maybeSingle()
  if (existing) return { data: existing }
  const { data, error } = await supabase
    .from('conversations')
    .insert({ event_id: eventId, participant_a: user.id, participant_b: otherUserId })
    .select()
    .single()
  if (error) return { error: error.message }
  return { data }
}

export async function getConversations(eventId: string) {
  const supabase = await createClient()
  const user = await requireUser()
  const { data } = await supabase
    .from('conversations')
    .select('*')
    .eq('event_id', eventId)
    .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
    .order('last_message_at', { ascending: false, nullsFirst: false })
  return data ?? []
}

export async function getMessages(conversationId: string) {
  const supabase = await createClient()
  await requireUser()
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function sendMessage(conversationId: string, body: string) {
  const supabase = await createClient()
  const user = await requireUser()
  if (!body.trim()) return { error: 'Message cannot be empty' }
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: user.id, body: body.trim(), status: 'sent' })
    .select()
    .single()
  if (error) return { error: error.message }
  // Update last_message_at on conversation
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)
  revalidatePath('/dashboard')
  return { data }
}

export async function getAttendeeDirectory(eventId: string) {
  const supabase = await createClient()
  const user = await requireUser()

  // LEFT JOIN profiles so attendees without global profiles still appear
  const { data: regs } = await supabase
    .from('registrations')
    .select('id, user_id, attendee_name, attendee_email, profiles!left(id, full_name, avatar_url, job_title, company, bio)')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
    .neq('user_id', user.id)

  if (!regs) return []

  // Fetch interests from attendee_profiles (event-specific networking profiles)
  const regIds = (regs as any[]).map(r => r.id)
  let interestMap: Record<string, string[]> = {}
  if (regIds.length > 0) {
    const { data: atProfiles } = await supabase
      .from('attendee_profiles')
      .select('registration_id, interests')
      .in('registration_id', regIds)
    for (const ap of atProfiles ?? []) {
      interestMap[(ap as any).registration_id] = (ap as any).interests ?? []
    }
  }

  // Fetch opt-out prefs; if no row exists, attendee is visible by default (networking_show_in_dir = true)
  const userIds = (regs as any[]).map((r: any) => r.user_id).filter(Boolean)
  const hiddenSet = new Set<string>()
  if (userIds.length > 0) {
    const { data: prefs } = await supabase
      .from('attendee_preferences')
      .select('user_id, networking_show_in_dir')
      .in('user_id', userIds)
    for (const p of prefs ?? []) {
      if ((p as any).networking_show_in_dir === false) {
        hiddenSet.add((p as any).user_id)
      }
    }
  }

  const visible = (regs as any[]).filter(r => !r.user_id || !hiddenSet.has(r.user_id))
  return visible.map(r => ({ ...r, interests: interestMap[r.id] ?? [] }))
}

export async function getSuggestedConnectionsByInterest(eventId: string) {
  const supabase = await createClient()
  const user = await requireUser()

  // Get current user's registration and interests for this event
  const { data: myReg } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .neq('status', 'cancelled')
    .limit(1)
    .maybeSingle()
  if (!myReg) return []

  const { data: myProfile } = await supabase
    .from('attendee_profiles')
    .select('interests')
    .eq('registration_id', (myReg as any).id)
    .maybeSingle()
  const myInterests: string[] = (myProfile as any)?.interests ?? []
  if (myInterests.length === 0) return []

  // Fetch other attendee profiles with interests
  const { data: others } = await supabase
    .from('attendee_profiles')
    .select('registration_id, interests, registrations!inner(id, user_id, attendee_name, profiles!left(avatar_url, job_title, company))')
    .eq('event_id', eventId)
    .eq('is_visible', true)
    .neq('registration_id', (myReg as any).id)

  if (!others) return []

  const mySet = new Set(myInterests.map(i => i.toLowerCase().trim()))
  return (others as any[])
    .filter(o => (o.interests ?? []).some((i: string) => mySet.has(i.toLowerCase().trim())))
    .slice(0, 5)
    .map(o => ({
      registration_id: o.registration_id,
      user_id: o.registrations?.user_id,
      attendee_name: o.registrations?.attendee_name ?? '',
      interests: o.interests ?? [],
      profiles: o.registrations?.profiles ?? null,
    }))
}

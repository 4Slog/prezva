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
  const { data } = await supabase
    .from('registrations')
    .select('user_id, attendee_name, attendee_email, profiles(id, full_name, avatar_url, job_title, company, bio)')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
    .not('user_id', 'is', null)
    .neq('user_id', user.id)
  return data ?? []
}

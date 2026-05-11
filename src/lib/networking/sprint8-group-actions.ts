'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const GroupSchema = z.object({
  name: z.string().min(1).max(100),
  member_ids: z.array(z.string().uuid()).min(0).max(50),
})

export async function createGroupConversation(eventId: string, raw: unknown) {
  const user = await requireUser()
  const supabase = await createClient()
  const data = GroupSchema.parse(raw)

  const { data: convo, error } = await supabase
    .from('group_conversations')
    .insert({ event_id: eventId, name: data.name, created_by: user.id })
    .select('id')
    .single()
  if (error) return { error: error.message }

  const convoId = (convo as any).id
  const memberIds = [...new Set([user.id, ...data.member_ids])]
  await supabase.from('group_conversation_members').insert(
    memberIds.map(uid => ({ conversation_id: convoId, user_id: uid }))
  )

  revalidatePath('/e')
  return { data: convo }
}

export async function getGroupConversations(eventId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data } = await supabase
    .from('group_conversations')
    .select('id, name, created_at, group_conversation_members!inner(user_id)')
    .eq('event_id', eventId)
    .eq('group_conversation_members.user_id', user.id)
    .order('created_at', { ascending: false })

  return (data ?? []) as any[]
}

export async function addGroupMessage(conversationId: string, body: string) {
  const user = await requireUser()
  if (!body.trim()) return { error: 'Message cannot be empty' }
  const supabase = await createClient()

  const { data: member } = await supabase
    .from('group_conversation_members')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .single()
  if (!member) return { error: 'Not a member of this conversation' }

  const { data, error } = await supabase
    .from('group_messages')
    .insert({ conversation_id: conversationId, sender_id: user.id, body: body.trim() })
    .select('id, body, created_at, sender_id')
    .single()

  if (error) return { error: error.message }
  return { data }
}

export async function getGroupMessages(conversationId: string, page = 0) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: member } = await supabase
    .from('group_conversation_members')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .single()
  if (!member) return []

  const PAGE_SIZE = 50
  const { data } = await supabase
    .from('group_messages')
    .select('id, body, created_at, sender_id')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  return (data ?? []) as any[]
}

export async function addGroupMember(conversationId: string, userId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: convo } = await supabase
    .from('group_conversations')
    .select('created_by')
    .eq('id', conversationId)
    .single()
  if (!convo || (convo as any).created_by !== user.id) return { error: 'Only the creator can add members' }

  const { error } = await supabase
    .from('group_conversation_members')
    .upsert({ conversation_id: conversationId, user_id: userId })
  if (error) return { error: error.message }
  return { success: true }
}

export async function getGroupMembers(conversationId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('group_conversation_members')
    .select('user_id, joined_at')
    .eq('conversation_id', conversationId)
  return (data ?? []) as any[]
}

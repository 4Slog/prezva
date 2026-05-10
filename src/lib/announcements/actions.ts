'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export type AnnouncementChannel = 'email' | 'push' | 'both'

export interface Announcement {
  id: string
  event_id: string
  created_by: string
  title: string
  body: string
  channel: AnnouncementChannel
  segment: string | null
  sent_at: string | null
  recipient_count: number
  created_at: string
}

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  channel: z.enum(['email', 'push', 'both']),
  segment: z.string().nullable().optional(),
})

export async function getAnnouncements(eventId: string) {
  const supabase = await createClient()
  await requireUser()
  const { data } = await supabase
    .from('announcements')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function createAnnouncement(eventId: string, formData: FormData) {
  const supabase = await createClient()
  const user = await requireUser()
  const raw = {
    title: formData.get('title'),
    body: formData.get('body'),
    channel: formData.get('channel'),
    segment: formData.get('segment') || null,
  }
  const parsed = CreateSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Count recipients based on segment
  let recipientCount = 0
  const { count } = await supabase
    .from('registrations')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
  recipientCount = count ?? 0

  const { data, error } = await supabase
    .from('announcements')
    .insert({
      event_id: eventId,
      created_by: user.id,
      title: parsed.data.title,
      body: parsed.data.body,
      channel: parsed.data.channel,
      segment: parsed.data.segment,
      sent_at: new Date().toISOString(),
      recipient_count: recipientCount,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { data }
}

export async function deleteAnnouncement(announcementId: string, eventId: string) {
  const supabase = await createClient()
  await requireUser()
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', announcementId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true }
}

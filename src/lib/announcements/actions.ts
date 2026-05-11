'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { enqueueAnnouncementDelivery } from '@/lib/trigger'
import { sendAnnouncementPush } from '@/lib/push/send'

export type AnnouncementChannel = 'email' | 'push' | 'both'

export interface Announcement {
  id: string
  event_id: string
  created_by: string
  title: string
  body: string
  channel: AnnouncementChannel
  segment: string | null
  audience_filter: { types: string[]; tags: string[] }
  exclude_filter: { types: string[]; tags: string[] }
  scheduled_for: string | null
  sent_at: string | null
  recipient_count: number
  created_at: string
}

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  channel: z.enum(['email', 'push', 'both']),
  segment: z.string().nullable().optional(),
  audience_types: z.string().optional(),
  exclude_types: z.string().optional(),
  scheduled_for: z.string().optional(),
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
    audience_types: formData.get('audience_types') as string || '',
    exclude_types: formData.get('exclude_types') as string || '',
    scheduled_for: formData.get('scheduled_for') as string || undefined,
  }
  const parsed = CreateSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const audienceTypes = parsed.data.audience_types ? parsed.data.audience_types.split(',').filter(Boolean) : []
  const excludeTypes = parsed.data.exclude_types ? parsed.data.exclude_types.split(',').filter(Boolean) : []
  const scheduledFor = parsed.data.scheduled_for || null

  // Count recipients
  const { count } = await supabase
    .from('registrations')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
  const recipientCount = count ?? 0

  const isScheduled = !!scheduledFor && new Date(scheduledFor) > new Date()

  const { data, error } = await supabase
    .from('announcements')
    .insert({
      event_id: eventId,
      created_by: user.id,
      title: parsed.data.title,
      body: parsed.data.body,
      channel: parsed.data.channel,
      segment: parsed.data.segment,
      audience_filter: { types: audienceTypes, tags: [] },
      exclude_filter: { types: excludeTypes, tags: [] },
      scheduled_for: scheduledFor,
      sent_at: isScheduled ? null : new Date().toISOString(),
      recipient_count: recipientCount,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  if (!isScheduled) {
    if (parsed.data.channel === 'email' || parsed.data.channel === 'both') {
      await enqueueAnnouncementDelivery({ announcementId: data.id })
    }
    if (parsed.data.channel === 'push' || parsed.data.channel === 'both') {
      await sendAnnouncementPush(eventId, parsed.data.title, parsed.data.body)
    }
  }

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

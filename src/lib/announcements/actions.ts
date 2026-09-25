'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { catchPermission } from '@/lib/auth/permission-error'
import { logAudit } from '@/lib/audit/log'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { enqueueAnnouncementDelivery } from '@/lib/trigger'
import { sendAnnouncementPush } from '@/lib/push/send'
import { notifyAnnouncementInApp } from '@/lib/announcements/in-app'

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
  const { data: ev } = await supabase.from('events').select('org_id').eq('id', eventId).single()
  if (!ev) return { error: 'Event not found' }
  try { await assertPermission(ev.org_id, user.id, 'announcements.send') } catch (e) { return catchPermission(e) }
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
      status: isScheduled ? 'scheduled' : 'draft',
      scheduled_for: scheduledFor,
      sent_at: null,
      recipient_count: recipientCount,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  await logAudit(supabase, null, user.id, 'announcement.create', 'announcements', data.id, { channel: parsed.data.channel, recipientCount }, { eventId })

  if (!isScheduled) {
    if (parsed.data.channel === 'push') {
      // In-app notices go out whatever happens to the push (D-R2).
      await notifyAnnouncementInApp(createAdminClient(), data.id)
      try {
        await sendAnnouncementPush(eventId, parsed.data.title, parsed.data.body)
        await supabase.from('announcements').update({ status: 'sent', sent_at: new Date().toISOString(), recipient_count: recipientCount }).eq('id', data.id)
      } catch (err) {
        console.error('[announcement] push-only send failed:', err)
        await supabase.from('announcements').update({ status: 'failed' }).eq('id', data.id)
      }
    } else {
      // email or both — the delivery task owns email AND (for 'both') push, so we do NOT fire push here
      await enqueueAnnouncementDelivery({ announcementId: data.id })
    }
  }

  revalidatePath('/dashboard')
  return { data }
}

export async function deleteAnnouncement(announcementId: string, eventId: string) {
  const user = await requireUser()
  // O122: the event is the announcement row's own event, not the caller's
  // eventId; the permission is checked on that event's org and the delete is
  // scoped to it.
  const admin = createAdminClient()
  const { data: ann } = await admin
    .from('announcements')
    .select('id, event_id')
    .eq('id', announcementId)
    .maybeSingle()
  if (!ann || ann.event_id !== eventId) return { error: 'Announcement not found' }
  const { data: ev } = await admin.from('events').select('org_id').eq('id', ann.event_id).maybeSingle()
  if (!ev) return { error: 'Event not found' }
  try { await assertPermission(ev.org_id, user.id, 'announcements.send') } catch (e) { return catchPermission(e) }
  const { data: deleted, error } = await admin
    .from('announcements')
    .delete()
    .eq('id', announcementId)
    .eq('event_id', ann.event_id)
    .select('id')
  if (error) return { error: error.message }
  if (!deleted?.length) return { error: 'Announcement not found' }
  await logAudit(admin, ev.org_id, user.id, 'announcement.delete', 'announcements', announcementId, undefined, { eventId: ann.event_id })
  revalidatePath('/dashboard')
  return { success: true }
}


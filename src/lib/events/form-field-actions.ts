'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const FIELD_TYPES = ['text', 'textarea', 'select', 'checkbox', 'radio', 'email', 'phone', 'date'] as const

const FieldSchema = z.object({
  label:          z.string().min(1).max(200),
  field_type:     z.enum(FIELD_TYPES),
  options:        z.array(z.string().min(1)).optional().nullable(),
  is_required:    z.boolean().default(false),
  sort_order:     z.number().int().default(0),
  ticket_type_id: z.string().uuid().optional().nullable(),
})

async function getEventOrgId(eventId: string) {
  const admin = createAdminClient()
  const { data } = await admin.from('events').select('org_id').eq('id', eventId).single()
  return data?.org_id as string | undefined
}

export async function getFormFields(eventId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('form_fields')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
  return (data ?? []) as any[]
}

export async function createFormField(eventId: string, input: unknown) {
  const user = await requireUser()
  const parsed = FieldSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const orgId = await getEventOrgId(eventId)
  if (!orgId) return { error: 'Event not found' }
  await assertPermission(orgId, user.id, 'event.manage')
  const admin = createAdminClient()
  const fieldKey = `cf_${Date.now()}`
  const options = ['select', 'radio', 'checkbox'].includes(parsed.data.field_type)
    ? (parsed.data.options ?? [])
    : null
  const { data, error } = await admin
    .from('form_fields')
    .insert({ event_id: eventId, field_key: fieldKey, ...parsed.data, options })
    .select()
    .single()
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { data }
}

export async function updateFormField(fieldId: string, input: unknown) {
  const user = await requireUser()
  const parsed = FieldSchema.partial().safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const admin = createAdminClient()
  const { data: field } = await admin.from('form_fields').select('event_id').eq('id', fieldId).single()
  if (!field) return { error: 'Field not found' }
  const orgId = await getEventOrgId(field.event_id)
  if (!orgId) return { error: 'Event not found' }
  await assertPermission(orgId, user.id, 'event.manage')
  const { error } = await admin.from('form_fields').update(parsed.data).eq('id', fieldId)
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { ok: true }
}

export async function deleteFormField(fieldId: string) {
  const user = await requireUser()
  const admin = createAdminClient()
  const { data: field } = await admin.from('form_fields').select('event_id').eq('id', fieldId).single()
  if (!field) return { error: 'Field not found' }
  const orgId = await getEventOrgId(field.event_id)
  if (!orgId) return { error: 'Event not found' }
  await assertPermission(orgId, user.id, 'event.manage')
  const { error } = await admin.from('form_fields').delete().eq('id', fieldId)
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { ok: true }
}

export async function reorderFormFields(fieldIds: string[]) {
  const user = await requireUser()
  const admin = createAdminClient()
  if (fieldIds.length === 0) return { ok: true }
  const { data: first } = await admin.from('form_fields').select('event_id').eq('id', fieldIds[0]).single()
  if (!first) return { error: 'Field not found' }
  const orgId = await getEventOrgId(first.event_id)
  if (!orgId) return { error: 'Event not found' }
  await assertPermission(orgId, user.id, 'event.manage')
  await Promise.all(
    fieldIds.map((id, idx) => admin.from('form_fields').update({ sort_order: idx }).eq('id', id))
  )
  revalidatePath('/events')
  return { ok: true }
}

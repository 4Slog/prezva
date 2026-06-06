'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { catchPermission } from '@/lib/auth/permission-error'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const CodeSchema = z.object({
  code: z.string().min(3).max(30).toUpperCase(),
  discount_type: z.enum(['percent', 'fixed']),
  discount_value: z.coerce.number().int().min(1),
  max_uses: z.coerce.number().int().min(1).nullable().optional(),
  valid_from: z.string().optional().nullable(),
  valid_until: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
})

async function getEventOrgId(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('events').select('org_id').eq('id', eventId).single()
  return data?.org_id as string | undefined
}

export async function getDiscountCodes(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('discount_codes')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  return (data ?? []) as any[]
}

export async function createDiscountCode(eventId: string, input: unknown) {
  const user = await requireUser()
  const parsed = CodeSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const orgId = await getEventOrgId(eventId)
  if (!orgId) return { error: 'Event not found' }
  try { await assertPermission(orgId, user.id, 'event.tickets') } catch (e) { return catchPermission(e) }
  const { data, error } = await supabase
    .from('discount_codes')
    .insert({ event_id: eventId, ...parsed.data })
    .select()
    .single()
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { data }
}

export async function toggleDiscountCode(eventId: string, codeId: string, isActive: boolean) {
  const user = await requireUser()
  const supabase = await createClient()
  const orgId = await getEventOrgId(eventId)
  if (!orgId) return { error: 'Event not found' }
  try { await assertPermission(orgId, user.id, 'event.tickets') } catch (e) { return catchPermission(e) }
  const { error } = await supabase
    .from('discount_codes')
    .update({ is_active: isActive })
    .eq('id', codeId)
    .eq('event_id', eventId)
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { ok: true }
}

export async function deleteDiscountCode(eventId: string, codeId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  const orgId = await getEventOrgId(eventId)
  if (!orgId) return { error: 'Event not found' }
  try { await assertPermission(orgId, user.id, 'event.tickets') } catch (e) { return catchPermission(e) }
  const { error } = await supabase
    .from('discount_codes')
    .delete()
    .eq('id', codeId)
    .eq('event_id', eventId)
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { ok: true }
}

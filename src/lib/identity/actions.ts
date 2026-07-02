'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { normalizeHandle, HandleSchema } from './handle'

export type UpdateHandleResult =
  | { ok: true; handle: string }
  | { ok: false; status: number; error: string; field?: 'handle' }

export async function updateHandle(raw: string): Promise<UpdateHandleResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Not authenticated' }

  const normalized = normalizeHandle(raw)
  const parsed = HandleSchema.safeParse(normalized)
  if (!parsed.success) {
    return { ok: false, status: 422, field: 'handle', error: parsed.error.issues[0].message }
  }

  const admin = createAdminClient()
  const { data: reserved } = await admin
    .from('reserved_handles')
    .select('handle')
    .eq('handle', normalized)
    .maybeSingle()
  if (reserved) {
    return { ok: false, status: 409, field: 'handle', error: 'That handle is reserved' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ handle: normalized, handle_customized: true })
    .eq('id', user.id)

  if (error) {
    if (error.code === '23505') {
      return { ok: false, status: 409, field: 'handle', error: 'That handle is already taken' }
    }
    return { ok: false, status: 500, error: 'Could not update handle' }
  }

  revalidatePath('/me/profile')
  revalidatePath('/me')
  revalidatePath('/dashboard')
  return { ok: true, handle: normalized }
}

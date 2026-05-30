import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

function parseEnvList(key: string): string[] {
  return (process.env[key] ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

export function isSuperAdmin(userId: string): boolean {
  return parseEnvList('SUPER_ADMIN_IDS').includes(userId)
}

export async function requireAdmin(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) redirect('/login')
  if (!parseEnvList('ADMIN_EMAILS').includes(user.email)) redirect('/dashboard?error=admin_required')
  return user.email
}

export const STEP_UP_COOKIE = 'pz-admin-step-up'
export const STEP_UP_MAX_AGE = 3600

export async function requireAdminStepUp(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const raw = cookieStore.get(STEP_UP_COOKIE)?.value
  if (raw) {
    const [cookieUserId, expStr] = raw.split(':')
    const exp = parseInt(expStr, 10)
    if (cookieUserId === user.id && !isNaN(exp) && exp > Date.now()) return
  }
  redirect('/admin/verify')
}

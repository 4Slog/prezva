import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'crypto'

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

/** Sign userId:exp with HMAC-SHA256. Cookie format: `userId:exp:sig`. */
export function buildStepUpCookieValue(userId: string, exp: number): string {
  const secret = process.env.STEP_UP_SECRET
  if (!secret) throw new Error('STEP_UP_SECRET env var is not set')
  const payload = `${userId}:${exp}`
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}:${sig}`
}

export async function requireAdminStepUp(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const secret = process.env.STEP_UP_SECRET
  if (secret) {
    const cookieStore = await cookies()
    const raw = cookieStore.get(STEP_UP_COOKIE)?.value
    if (raw) {
      // Format: userId:exp:sig  (UUIDs contain hyphens, not colons)
      const lastColon = raw.lastIndexOf(':')
      const secondLastColon = raw.lastIndexOf(':', lastColon - 1)
      if (lastColon > 0 && secondLastColon > 0) {
        const cookieUserId = raw.slice(0, secondLastColon)
        const expStr = raw.slice(secondLastColon + 1, lastColon)
        const sig = raw.slice(lastColon + 1)
        const exp = parseInt(expStr, 10)
        if (cookieUserId === user.id && !isNaN(exp) && exp > Date.now()) {
          const payload = `${cookieUserId}:${expStr}`
          const expected = createHmac('sha256', secret).update(payload).digest('base64url')
          const sigBuf = Buffer.from(sig, 'base64url')
          const expectedBuf = Buffer.from(expected, 'base64url')
          if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) return
        }
      }
    }
  }
  redirect('/admin/verify')
}

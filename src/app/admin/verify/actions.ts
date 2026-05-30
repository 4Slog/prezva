'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, buildStepUpCookieValue, STEP_UP_COOKIE, STEP_UP_MAX_AGE } from '@/lib/admin/gate'

export async function verifyAdminStepUp(_prev: unknown, formData: FormData) {
  const email = await requireAdmin()

  if (!process.env.STEP_UP_SECRET) {
    return { error: 'Server misconfiguration: STEP_UP_SECRET is not set. Contact the operator.' }
  }

  const password = formData.get('password')
  if (typeof password !== 'string' || !password) {
    return { error: 'Password is required.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { error: 'Incorrect password.' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session error. Please try again.' }

  const exp = Date.now() + STEP_UP_MAX_AGE * 1000
  const cookieStore = await cookies()
  cookieStore.set(STEP_UP_COOKIE, buildStepUpCookieValue(user.id, exp), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: STEP_UP_MAX_AGE,
    path: '/admin',
  })

  redirect('/admin')
}

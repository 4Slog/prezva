'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPostLoginRedirect } from '@/lib/auth/post-login-redirect'

export async function signUp(_prevState: unknown, formData: FormData): Promise<{ error?: string; success?: string }> {
  const supabase = await createClient()
  const email    = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('full_name') as string

  const rawNext = formData.get('next')
  const next = typeof rawNext === 'string' && rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.startsWith('/\\') ? rawNext : null

  // Create the account
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      ...(next ? { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}` } : {}),
    },
  })

  if (error) return { error: error.message }

  return { success: 'Check your email to confirm your account.' }
}

export async function signIn(_prevState: unknown, formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const nextParam = (formData.get('next') as string | null)?.trim() || null

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')

  // Honor explicit deep links (e.g. /invite/[token]); otherwise route by relationships.
  if (nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')) {
    redirect(nextParam)
  }
  const target = await getPostLoginRedirect(data.user.id, data.user.email)
  redirect(target)
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

export async function resetPassword(_prevState: unknown, formData: FormData): Promise<{ error?: string; success?: string }> {
  const supabase = await createClient()
  const email = formData.get('email') as string

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/auth/update-password`,
  })

  if (error) return { error: error.message }
  return { success: 'Password reset link sent. Check your email.' }
}

export async function updatePassword(_prevState: unknown, formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const password = formData.get('password') as string

  const { data, error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  if (data.user) {
    const target = await getPostLoginRedirect(data.user.id, data.user.email)
    redirect(target)
  }
  redirect('/me')
}

import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getPostLoginRedirect } from '@/lib/auth/post-login-redirect'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const nextParam = searchParams.get('next')

  if (tokenHash && type) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) {
      if (nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.startsWith('/\\')) {
        return NextResponse.redirect(`${origin}${nextParam}`)
      }
      const user = data.user
      const target = user ? await getPostLoginRedirect(user.id, user.email) : '/me'
      return NextResponse.redirect(`${origin}${target}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}

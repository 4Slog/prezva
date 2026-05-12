import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const next = request.nextUrl.searchParams.get('next') ?? '/dashboard'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  })

  if (error || !data.url) {
    return NextResponse.redirect(new URL(`/login?error=oauth_failed`, request.url))
  }

  return NextResponse.redirect(data.url)
}

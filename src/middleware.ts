import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // ADMIN_HOST seam — default-off. Behaviour is EXACTLY today's when ADMIN_HOST is unset.
  // When set, requests on that host are rewritten into /admin/* so the (admin) route group
  // handles them. DNS and Vercel domain config are separate (not touched here).
  const adminHost = process.env.ADMIN_HOST
  if (adminHost && request.headers.get('host') === adminHost) {
    const url = request.nextUrl.clone()
    url.pathname = `/admin${url.pathname === '/' ? '' : url.pathname}`
    return NextResponse.rewrite(url)
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

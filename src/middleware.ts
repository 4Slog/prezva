import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { buildEmbeddedCsp } from '@/lib/embedded/session'

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

  // EMBEDDED seam — /embedded/* gets a GHL-specific frame-ancestors CSP and skips
  // Supabase session refresh (the embedded surface uses its own signed-JWT cookie).
  // next.config.ts X-Frame-Options: DENY still appears in the response but modern
  // browsers honour frame-ancestors over X-Frame-Options per the CSP spec; GHL runs
  // on Chromium so this is safe. Standalone paths are completely unaffected.
  if (request.nextUrl.pathname.startsWith('/embedded')) {
    const extraOrigins = (process.env.GHL_FRAME_ANCESTORS ?? '')
      .split(' ')
      .map((s) => s.trim())
      .filter(Boolean)
    const csp = buildEmbeddedCsp(extraOrigins)
    const response = NextResponse.next()
    response.headers.set('Content-Security-Policy', csp)
    // Attempt to remove the X-Frame-Options: DENY that next.config sets for /(.*).
    // If Next.js applies next.config headers after middleware (which it does), this
    // delete is a best-effort — the DENY may still appear. Documented above.
    response.headers.delete('X-Frame-Options')
    return response
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

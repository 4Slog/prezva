// Resolves the post-login destination carried into /auth/confirm.
//
// Two shapes arrive here:
//   - a relative path (app-access hands one over directly), and
//   - a same-origin absolute URL: Supabase auth email templates render
//     next={{ .RedirectTo }}, which is the emailRedirectTo the app passed or,
//     when none was passed or it failed the allow-list, the project's site_url.
//
// Returns a relative path or null, never an absolute URL — callers always
// redirect to `${origin}${path}`. null means "no explicit destination" and the
// caller falls back to getPostLoginRedirect.

function isSafeRelativePath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\')
}

function isAuthCallback(path: string): boolean {
  return path === '/auth/callback' || path.startsWith('/auth/callback?') || path.startsWith('/auth/callback/')
}

function accept(path: string): string | null {
  if (!isSafeRelativePath(path)) return null
  // Links requested under the old code carry next=APP_URL/auth/callback?next=...; the callback without a code shows auth_callback_failed to a signed-in user.
  if (isAuthCallback(path)) return null
  return path
}

export function resolveNext(nextParam: string | null, origin: string): string | null {
  if (!nextParam) return null

  if (nextParam.startsWith('/')) {
    return accept(nextParam)
  }

  let url: URL
  try {
    url = new URL(nextParam)
  } catch {
    return null
  }
  if (url.origin !== origin) return null

  const path = `${url.pathname}${url.search}${url.hash}`
  // The bare site_url fallback: Supabase had no destination to carry.
  if (path === '/') return null
  return accept(path)
}

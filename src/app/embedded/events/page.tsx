import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'

interface Props {
  searchParams: Promise<{
    location_id?: string
    user_email?: string
    location_name?: string
    k?: string
  }>
}

export default async function EmbeddedEventsPage({ searchParams }: Props) {
  const params = await searchParams
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value

  // Valid session: render placeholder shell (GE-2b will add real location→org mapping)
  if (token) {
    try {
      const session = await verifyEmbeddedSession(token)
      const locationName = session.location_id // GE-2b replaces this with org lookup

      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <h1 className="text-2xl font-semibold tracking-tight">GHL Events</h1>
          <p className="text-sm text-gray-500">Location: {locationName}</p>
          <p className="text-xs text-gray-400">
            Full event management coming in the next phase.
          </p>
        </div>
      )
    } catch {
      // Token invalid or expired — fall through to launch redirect or no-context UI
    }
  }

  // No session, but launch params present: send through the launch flow.
  // k (the pre-shared secret) must be forwarded so the launch route can authorize.
  if (params.location_id) {
    const launchUrl = new URL('/api/embedded/launch', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
    launchUrl.searchParams.set('location_id', params.location_id)
    if (params.user_email) launchUrl.searchParams.set('user_email', params.user_email)
    if (params.location_name) launchUrl.searchParams.set('location_name', params.location_name)
    if (params.k) launchUrl.searchParams.set('k', params.k)
    redirect(launchUrl.pathname + launchUrl.search)
  }

  // No session, no params: neutral no-context placeholder
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-base font-medium text-gray-700">
        Open this from inside GoHighLevel
      </p>
      <p className="text-sm text-gray-400">
        This page is only accessible as an embedded app within your GHL account.
      </p>
    </div>
  )
}

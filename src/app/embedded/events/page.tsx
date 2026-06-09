import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { createAdminClient } from '@/lib/supabase/admin'

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

  if (token) {
    try {
      const session = await verifyEmbeddedSession(token)
      const db = createAdminClient()

      // Resolve location -> org mapping (service-role read; RLS bypassed — scope every query by id)
      const { data: link } = await db
        .from('ghl_location_links')
        .select('org_id')
        .eq('ghl_location_id', session.location_id)
        .maybeSingle()

      if (!link) {
        return (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-base font-medium text-gray-700">
              This location isn&apos;t linked to an organization yet.
            </p>
            <p className="text-sm text-gray-400">
              Contact your administrator to complete the setup.
            </p>
          </div>
        )
      }

      // Scope strictly by org_id — service-role bypasses RLS so we enforce it manually
      const { data: org } = await db
        .from('organizations')
        .select('name')
        .eq('id', link.org_id)
        .maybeSingle()

      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {org?.name ?? 'Events'}
          </h1>
          <p className="text-sm text-gray-500">Event management</p>
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

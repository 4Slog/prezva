import { notFound } from 'next/navigation'
import { getPublicEvent } from '@/lib/public/actions'
import { AttendeeShell } from '@/components/attendee/AttendeeShell'
import { getSessionIdentity } from '@/lib/auth/session-identity'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export default async function AttendeeLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const event = await getPublicEvent(slug)
  if (!event) notFound()

  const identity = await getSessionIdentity(slug)
  const hasRegistration = identity.type !== 'anonymous'

  let avatarUrl: string | null = null
  if (identity.type === 'user') {
    const sb = await createClient()
    const admin = createAdminClient()
    const [{ data: globalRow }, { data: overrideRow }] = await Promise.all([
      sb.from('profiles').select('avatar_url').eq('id', identity.userId).maybeSingle(),
      admin.from('attendee_profiles').select('avatar_url').eq('event_id', (event as any).id).eq('user_id', identity.userId).maybeSingle(),
    ])
    avatarUrl = overrideRow?.avatar_url ?? globalRow?.avatar_url ?? null
  } else if (identity.type === 'registration') {
    const admin = createAdminClient()
    const { data: overrideRow } = await admin
      .from('attendee_profiles').select('avatar_url').eq('registration_id', identity.registrationId).maybeSingle()
    avatarUrl = overrideRow?.avatar_url ?? null
  }

  return (
    <AttendeeShell
      event={{
        title: event.title,
        slug: event.slug,
        certificate_enabled: (event as any).certificate_enabled ?? false,
        organizations: (event as any).organizations ?? null,
      }}
      hasRegistration={hasRegistration}
      avatarUrl={avatarUrl}
    >
      {children}
    </AttendeeShell>
  )
}

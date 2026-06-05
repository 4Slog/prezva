import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { getPublicEvent } from '@/lib/public/actions'
import { AttendeeShell } from '@/components/attendee/AttendeeShell'

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

  const jar = await cookies()
  const hasRegistration = !!jar.get(`pz_reg_${slug}`)?.value

  return (
    <AttendeeShell
      event={{
        title: event.title,
        slug: event.slug,
        certificate_enabled: (event as any).certificate_enabled ?? false,
        organizations: (event as any).organizations ?? null,
      }}
      hasRegistration={hasRegistration}
    >
      {children}
    </AttendeeShell>
  )
}

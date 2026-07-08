import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import {
  embedGetVolunteers,
  embedAddVolunteer,
  embedCheckinVolunteer,
  embedResendVolunteerInvite,
  embedRemoveVolunteer,
  embedExportVolunteerHours,
} from '@/lib/embedded/volunteers-actions'
import { VolunteersClient } from '@/app/(dashboard)/events/[slug]/volunteers/volunteers-client'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedVolunteersPage({ params }: Props) {
  const { eventId } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  try {
    await verifyEmbeddedSession(token)
  } catch {
    redirect('/embedded/events')
  }

  let data: Awaited<ReturnType<typeof embedGetVolunteers>>
  try {
    data = await embedGetVolunteers(eventId)
  } catch {
    redirect('/embedded/events')
  }

  const { volunteers, alerts, eventSlug } = data

  return (
    <>
      <h1 className="mb-6 text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Volunteers</h1>
      <VolunteersClient
        eventId={eventId}
        eventSlug={eventSlug}
        volunteers={volunteers as any}
        sessions={[]}
        alerts={alerts as any}
        permissions={['volunteers.manage']}
        addAction={embedAddVolunteer}
        checkinAction={embedCheckinVolunteer}
        resendAction={embedResendVolunteerInvite}
        removeAction={embedRemoveVolunteer}
        exportHoursAction={embedExportVolunteerHours}
      />
    </>
  )
}

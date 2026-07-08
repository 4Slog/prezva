import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import {
  embedGetSponsors,
  embedCreateSponsor,
  embedUpdateSponsor,
  embedDeleteSponsor,
} from '@/lib/embedded/sponsors-actions'
import { SponsorsClient } from '@/app/(dashboard)/events/[slug]/sponsors/sponsors-client'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedSponsorsPage({ params }: Props) {
  const { eventId } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  try {
    await verifyEmbeddedSession(token)
  } catch {
    redirect('/embedded/events')
  }

  let data: Awaited<ReturnType<typeof embedGetSponsors>>
  try {
    data = await embedGetSponsors(eventId)
  } catch {
    redirect('/embedded/events')
  }

  const { sponsors, eventSlug } = data

  return (
    <>
      <h1 className="mb-6 text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Sponsors</h1>
      <SponsorsClient
        eventId={eventId}
        eventSlug={eventSlug}
        sponsors={sponsors as any}
        permissions={['sponsors.manage']}
        createAction={embedCreateSponsor}
        updateAction={embedUpdateSponsor}
        deleteAction={embedDeleteSponsor}
        showBoothContacts={false}
      />
    </>
  )
}

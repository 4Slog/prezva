import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import {
  embedGetPassportData,
  embedCreatePassportLocation,
  embedDeletePassportLocation,
} from '@/lib/embedded/engagement-actions'
import PassportAdminClient from '@/app/(dashboard)/events/[slug]/passport/client'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedPassportPage({ params }: Props) {
  const { eventId } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  try {
    await verifyEmbeddedSession(token)
  } catch {
    redirect('/embedded/events')
  }

  let data: Awaited<ReturnType<typeof embedGetPassportData>>
  try {
    data = await embedGetPassportData(eventId)
  } catch {
    redirect('/embedded/events')
  }

  const { locations, totalStamps, leaderboard } = data

  return (
    <>
      <h1 className="mb-6 text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Passport</h1>
      <PassportAdminClient
        eventId={eventId}
        initialLocations={locations}
        totalStamps={totalStamps}
        leaderboard={leaderboard}
        permissions={['*']}
        createAction={embedCreatePassportLocation}
        deleteAction={embedDeletePassportLocation}
      />
    </>
  )
}

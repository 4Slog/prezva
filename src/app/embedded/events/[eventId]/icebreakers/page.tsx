import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import {
  embedGetIcebreakersData,
  embedSeedIcebreakerPrompts,
  embedSetIcebreakersActive,
} from '@/lib/embedded/engagement-actions'
import { IcebreakersAdminClient } from '@/app/(dashboard)/events/[slug]/icebreakers/client'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedIcebreakersPage({ params }: Props) {
  const { eventId } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  try {
    await verifyEmbeddedSession(token)
  } catch {
    redirect('/embedded/events')
  }

  let data: Awaited<ReturnType<typeof embedGetIcebreakersData>>
  try {
    data = await embedGetIcebreakersData(eventId)
  } catch {
    redirect('/embedded/events')
  }

  const { eventSlug, orgId, questions, isActive } = data

  return (
    <>
      <h1 className="mb-6 text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Icebreakers</h1>
      <IcebreakersAdminClient
        questions={questions as any[]}
        eventId={eventId}
        orgId={orgId}
        eventSlug={eventSlug}
        isActive={isActive}
        seedAction={embedSeedIcebreakerPrompts}
        setActiveAction={embedSetIcebreakersActive}
      />
    </>
  )
}

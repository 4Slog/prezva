import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import {
  embedGetTriviaData,
  embedSeedTriviaQuestions,
  embedSetTriviaActive,
} from '@/lib/embedded/engagement-actions'
import { TriviaAdminClient } from '@/app/(dashboard)/events/[slug]/trivia/client'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedTriviaPage({ params }: Props) {
  const { eventId } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  try {
    await verifyEmbeddedSession(token)
  } catch {
    redirect('/embedded/events')
  }

  let data: Awaited<ReturnType<typeof embedGetTriviaData>>
  try {
    data = await embedGetTriviaData(eventId)
  } catch {
    redirect('/embedded/events')
  }

  const { eventSlug, orgId, questions, isActive } = data

  return (
    <>
      <h1 className="mb-6 text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Trivia</h1>
      <TriviaAdminClient
        questions={questions as any[]}
        eventId={eventId}
        orgId={orgId}
        eventSlug={eventSlug}
        isActive={isActive}
        seedAction={embedSeedTriviaQuestions}
        setActiveAction={embedSetTriviaActive}
      />
    </>
  )
}

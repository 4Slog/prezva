import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { embedGetSpeakerFormSchema, embedSaveSpeakerFormSchema } from '@/lib/embedded/speakers-actions'
import { SpeakerFormBuilderClient } from '@/app/(dashboard)/events/[slug]/speakers/form/speaker-form-builder-client'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedSpeakerFormPage({ params }: Props) {
  const { eventId } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  try {
    await verifyEmbeddedSession(token)
  } catch {
    redirect('/embedded/events')
  }

  let schema: any[]
  try {
    schema = await embedGetSpeakerFormSchema(eventId)
  } catch {
    redirect('/embedded/events')
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <a href={`/embedded/events/${eventId}/speakers`} className="text-sm" style={{ color: 'var(--pz-teal)' }}>← Speakers</a>
        <h1 className="text-xl font-bold mt-2 mb-1" style={{ color: 'var(--pz-text)' }}>Speaker Info Form</h1>
        <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>Configure what information to collect from speakers.</p>
      </div>
      <SpeakerFormBuilderClient
        eventId={eventId}
        initialSchema={schema}
        saveAction={embedSaveSpeakerFormSchema}
      />
    </div>
  )
}

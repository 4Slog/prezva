import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import {
  embedGetAgendaData,
  embedGetSessions,
  embedCreateSession,
  embedUpdateSession,
  embedDeleteSession,
  embedCreateRoom,
  embedDeleteRoom,
  embedCreateTrack,
  embedUpdateTrack,
  embedDeleteTrack,
  embedCreateOrgSessionType,
  embedUpdateOrgSessionType,
  embedDeleteOrgSessionType,
} from '@/lib/embedded/agenda-actions'
import { AgendaClient } from '@/app/(dashboard)/events/[slug]/agenda/client'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedAgendaPage({ params }: Props) {
  const { eventId } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  try {
    await verifyEmbeddedSession(token)
  } catch {
    redirect('/embedded/events')
  }

  let pageData: Awaited<ReturnType<typeof embedGetAgendaData>>
  try {
    pageData = await embedGetAgendaData(eventId)
  } catch {
    redirect('/embedded/events')
  }

  const { orgId, timezone, sessions, tracks, rooms, speakers, customTypes } = pageData

  return (
    <div className="p-6">
      <AgendaClient
        eventId={eventId}
        orgId={orgId}
        timezone={timezone}
        initialSessions={sessions}
        tracks={tracks}
        rooms={rooms}
        speakers={speakers}
        sponsors={[]}
        zoomConnected={false}
        teamsConnected={false}
        customTypes={customTypes}
        embed
        embedActions={{
          reloadSessions: embedGetSessions,
          createSession: embedCreateSession,
          updateSession: embedUpdateSession,
          deleteSession: embedDeleteSession,
          createRoom: embedCreateRoom,
          deleteRoom: embedDeleteRoom,
          createTrack: embedCreateTrack,
          updateTrack: embedUpdateTrack,
          deleteTrack: embedDeleteTrack,
          createOrgSessionType: embedCreateOrgSessionType,
          updateOrgSessionType: embedUpdateOrgSessionType,
          deleteOrgSessionType: embedDeleteOrgSessionType,
        }}
      />
    </div>
  )
}

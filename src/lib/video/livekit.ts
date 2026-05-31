import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'

function getRoomService() {
  return new RoomServiceClient(
    process.env.LIVEKIT_URL!,
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
  )
}

export async function createRoom(roomName: string) {
  const svc = getRoomService()
  await svc.createRoom({ name: roomName, emptyTimeout: 600, maxParticipants: 500 })
}

export async function generateToken(
  roomName: string,
  participantIdentity: string,
  participantName: string,
  isPublisher: boolean,
): Promise<string> {
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    { identity: participantIdentity, name: participantName, ttl: '4h' },
  )
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: isPublisher,
    canSubscribe: true,
  })
  return await at.toJwt()
}

export async function deleteRoom(roomName: string) {
  const svc = getRoomService()
  await svc.deleteRoom(roomName)
}

export async function muteParticipantTrack(
  roomName: string,
  participantIdentity: string,
  trackSid: string,
) {
  const svc = getRoomService()
  await svc.mutePublishedTrack(roomName, participantIdentity, trackSid, true)
}

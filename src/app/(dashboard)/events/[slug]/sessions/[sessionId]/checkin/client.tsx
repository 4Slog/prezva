'use client'

import { useMemo } from 'react'
import { SessionCheckInScanner, type SessionScannerActions } from '@/components/checkin/SessionCheckInScanner'
import { orgCheckInToSession, orgOverrideSessionCheckIn, getOfflineSessionPack } from '@/lib/checkin/actions'
import type { SessionAttendeeRow } from '@/lib/checkin/actions'

interface Props {
  eventId: string
  sessionId: string
  sessionTitle: string
  sessionUrl: string
  initialAttendees: SessionAttendeeRow[]
  // The signed-in user id: scopes this device's offline store (M3b).
  staffUserId: string
}

export default function SessionCheckInClient({ eventId, sessionId, staffUserId, ...rest }: Props) {
  const actions = useMemo<SessionScannerActions>(() => ({
    scan: code => orgCheckInToSession(eventId, sessionId, code, 'qr_scan'),
    mark: registrationId => orgCheckInToSession(eventId, sessionId, registrationId, 'manual'),
    override: registrationId => orgOverrideSessionCheckIn(eventId, sessionId, registrationId),
    fetchPack: () => getOfflineSessionPack(eventId, sessionId),
  }), [eventId, sessionId])

  return (
    <SessionCheckInScanner
      surface="dashboard"
      eventId={eventId}
      sessionId={sessionId}
      staffKey={staffUserId}
      actions={actions}
      {...rest}
    />
  )
}

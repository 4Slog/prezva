'use client'

import { useMemo } from 'react'
import { SessionCheckInScanner, type SessionScannerActions } from '@/components/checkin/SessionCheckInScanner'
import {
  embedScanIntoSession,
  embedManualMarkSession,
  embedOverrideSessionCheckIn,
  embedGetOfflineSessionPack,
} from '@/lib/embedded/checkin-actions'
import type { SessionAttendeeRow } from '@/lib/embedded/checkin-actions'

interface Props {
  eventId: string
  sessionId: string
  sessionTitle: string
  sessionUrl: string
  initialAttendees: SessionAttendeeRow[]
  // The embed session's staff email (or null): scopes this device's offline store (M3b).
  staffEmail: string | null
}

export default function EmbedSessionCheckInClient({ eventId, sessionId, staffEmail, ...rest }: Props) {
  const actions = useMemo<SessionScannerActions>(() => ({
    scan: code => embedScanIntoSession(eventId, sessionId, code),
    mark: registrationId => embedManualMarkSession(eventId, sessionId, registrationId),
    override: registrationId => embedOverrideSessionCheckIn(eventId, sessionId, registrationId),
    fetchPack: () => embedGetOfflineSessionPack(eventId, sessionId),
  }), [eventId, sessionId])

  return (
    <SessionCheckInScanner
      surface="embed"
      eventId={eventId}
      sessionId={sessionId}
      staffKey={staffEmail}
      actions={actions}
      {...rest}
    />
  )
}

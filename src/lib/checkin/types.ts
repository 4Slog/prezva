import type { DoorRefusal } from '@/lib/checkin/admission'

// Shared check-in result types. A plain module (no 'use server', no
// server-only) so the server-only door core and the server actions can both
// import it without importing each other.

export interface CheckInResult {
  success: boolean
  registration?: {
    id: string
    attendee_name: string
    attendee_email: string
    ticket_name: string
    already_checked_in: boolean
    check_in_time?: string
  }
  error?: string
  points_awarded?: number
  // Set on a refused GHL ticket scan (R79): staff may record an override (R81).
  canOverride?: boolean
  // Set when the door refuses a ticket (R90): who, why, and what to do.
  refusal?: DoorRefusal
}

// Offline marker for a queued check-in (R87). checked_in_source stays the
// surface; these columns say it came from a device queue.
export interface OfflineWrite {
  checkedInAt: string
  clientScannedAt: string | null
  clientEntryId: string
}

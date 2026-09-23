// Classifies the text a check-in scanner decoded (M3a).
//
// Two ticket formats reach the session scanners:
//   - Prezva's own QR: registrations.qr_code, 32 hex chars by default.
//   - GHL Events tickets (R71): v1.<24-hex attendee_id>.<43-char base64url signature>,
//     plain text, not a URL.
//
// The GHL signature CANNOT be verified — only GHL holds the signing key — so it is
// matched for shape and otherwise ignored. The control is R79: a GHL token counts
// only when its attendee_id is registered (registrations.ghl_attendee_id) for the
// SAME event the scanner is on. Callers must do that event-scoped lookup.

export type ScanToken =
  | { kind: 'prezva'; qrCode: string }
  | { kind: 'ghl'; attendeeId: string }
  | { kind: 'unknown' }

// Refusal shown to staff when a GHL ticket is not registered on this event. It must
// never name the event the token does belong to.
export const GHL_TICKET_NOT_REGISTERED = "This GHL ticket isn't registered for this event"

const GHL_TOKEN = /^v1\.([0-9a-f]{24})\.[A-Za-z0-9_-]{43}$/i
const PREZVA_QR = /^[0-9a-f]{32}$/i

export function parseScanToken(raw: string): ScanToken {
  const text = raw.trim()
  const ghl = GHL_TOKEN.exec(text)
  if (ghl) return { kind: 'ghl', attendeeId: ghl[1].toLowerCase() }
  if (PREZVA_QR.test(text)) return { kind: 'prezva', qrCode: text.toLowerCase() }
  return { kind: 'unknown' }
}

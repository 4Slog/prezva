// F-R6: shown to organizers wherever certificates are configured, when
// certificates are on and the event has no published sessions. Such an event
// certifies door check-in only, with no CE credits (F-R1).
export const ZERO_SESSION_CERTIFICATE_WARNING =
  'Attendees will receive an attendance certificate with no CE credits until you add sessions.'

// O166 / G-R8: the eligibility line on the certificates pages. With no
// published sessions the percentage rule cannot apply; door check-in earns an
// attendance certificate (F-R1).
export const ZERO_SESSION_ELIGIBILITY =
  'Attendees checked in at the door receive an attendance certificate (no CE credits).'

export function certificateEligibilityText(publishedSessions: number | null, minPct: number): string {
  return publishedSessions === 0 ? ZERO_SESSION_ELIGIBILITY : `Attendees who completed ≥${minPct}% of sessions`
}

export function ZeroSessionCertificateWarning({
  certificatesEnabled,
  publishedSessions,
}: {
  certificatesEnabled: boolean | null | undefined
  publishedSessions: number | null
}) {
  if (!certificatesEnabled || publishedSessions !== 0) return null
  return (
    <div
      role="status"
      style={{
        background: 'var(--pz-warning-bg)',
        border: '1px solid var(--pz-warning-fill)',
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 16,
        fontSize: 13,
        color: 'var(--pz-text)',
      }}
    >
      {ZERO_SESSION_CERTIFICATE_WARNING}
    </div>
  )
}

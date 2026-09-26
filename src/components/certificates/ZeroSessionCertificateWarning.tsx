// F-R6: shown to organizers wherever certificates are configured, when
// certificates are on and the event has no published sessions. Such an event
// certifies door check-in only, with no CE credits (F-R1).
export const ZERO_SESSION_CERTIFICATE_WARNING =
  'Attendees will receive an attendance certificate with no CE credits until you add sessions.'

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

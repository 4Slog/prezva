// O157 / G-R6 (Paul): a certificate stops being served when its registration
// is cancelled or refunded. The issued_certificates row is kept for audit and
// never changes (F-R3); servability is decided at serve time from the
// registration's status, so a registration restored to confirmed serves the
// same stored certificate again. No revoke column.
export function isCertificateServable(registrationStatus: string | null | undefined): boolean {
  return registrationStatus === 'confirmed'
}

// Never mentions refund or cancellation: the verify page is public.
export const CERTIFICATE_NOT_AVAILABLE = 'This certificate is no longer available.'
export const CERTIFICATE_NOT_VALID = 'This certificate is no longer valid.'

// The emailed download link: the registration's certificate token lets a
// signed-out attendee download (the route accepts owner OR token).
export function certificateDownloadUrl(appUrl: string, registrationId: string, certificateToken: string | null): string {
  const base = `${appUrl}/api/certificates/${registrationId}`
  return certificateToken ? `${base}?token=${encodeURIComponent(certificateToken)}` : base
}

export const DEFAULT_CERTIFICATE_TEMPLATE = {
  name: 'Standard Certificate of Attendance',
  payload: {
    accent_color: '#00BFA6',
    org_logo_position: 'top-center' as const,
    title: 'Certificate of Attendance',
    body: 'This is to certify that {attendee_name} attended {event_title} on {event_date} and completed {sessions_attended} sessions for {ce_credit_hours} CE credit hours.',
    footer: 'Issued by {org_name} | Verify at {verification_url}',
    signature_image_url: null as string | null,
  },
}

export type CertificateTemplatePayload = typeof DEFAULT_CERTIFICATE_TEMPLATE.payload

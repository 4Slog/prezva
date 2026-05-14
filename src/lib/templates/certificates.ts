export const DEFAULT_CERTIFICATE_TEMPLATE = {
  name: 'Standard Certificate of Attendance',
  payload: {
    accent_color: '#00BFA6',
    org_logo_position: 'top-center' as const,
    title: 'Certificate of Attendance',
    body: 'This is to certify that {attendee_name} attended {event_title} on {event_date} and completed {sessions_attended} sessions for {ce_credit_hours} CE credit hours.',
    footer: 'Issued by {org_name} | Verify at {verification_url}',
    signature_image_url: null as string | null,
    ce_credits_field: false as boolean | undefined,
    licensing_body_note: undefined as string | undefined,
  },
}

export interface CertificateTemplatePayload {
  accent_color: string
  org_logo_position: 'top-center'
  title: string
  body: string
  footer: string
  signature_image_url: string | null
  ce_credits_field?: boolean
  licensing_body_note?: string
}

export interface CertificateTemplate {
  id: string
  name: string
  description: string
  payload: CertificateTemplatePayload
}

export const CERTIFICATE_TEMPLATES: CertificateTemplate[] = [
  {
    id: 'cert-attendance',
    name: 'Certificate of Attendance',
    description: 'Standard attendance certificate — suitable for any event',
    payload: {
      accent_color: '#00BFA6',
      org_logo_position: 'top-center',
      title: 'Certificate of Attendance',
      body: 'This certifies that {attendee_name} attended {event_title} on {event_date}, hosted by {org_name}.',
      footer: 'Issued by {org_name} | Verify at {verification_url}',
      signature_image_url: null,
    },
  },
  {
    id: 'cert-ce-credit',
    name: 'Continuing Education Certificate',
    description: 'CE credit certificate with hours and licensing board submission note',
    payload: {
      accent_color: '#00BFA6',
      org_logo_position: 'top-center',
      title: 'Certificate of Continuing Education',
      body: 'This certifies that {attendee_name} successfully completed {event_title} on {event_date} and earned {ce_credit_hours} continuing education credit hours.',
      footer: 'Issued by {org_name} | Verify at {verification_url}',
      signature_image_url: null,
      ce_credits_field: true,
      licensing_body_note: 'Submit to your licensing board within 30 days of issuance to receive credit.',
    },
  },
  {
    id: 'cert-speaker',
    name: 'Certificate of Speaking',
    description: 'Recognition certificate for event speakers and presenters',
    payload: {
      accent_color: '#7c3aed',
      org_logo_position: 'top-center',
      title: 'Certificate of Speaking',
      body: 'This certificate is awarded to {attendee_name} in recognition of their outstanding contribution as a speaker at {event_title} on {event_date}.',
      footer: 'Issued by {org_name} | Verify at {verification_url}',
      signature_image_url: null,
    },
  },
  {
    id: 'cert-training',
    name: 'Certificate of Training',
    description: 'Training completion certificate with CE credit support',
    payload: {
      accent_color: '#0891b2',
      org_logo_position: 'top-center',
      title: 'Certificate of Training',
      body: 'This certifies that {attendee_name} successfully completed the training program {event_title} on {event_date}, demonstrating proficiency in the subject matter presented.',
      footer: 'Issued by {org_name} | Verify at {verification_url}',
      signature_image_url: null,
      ce_credits_field: true,
      licensing_body_note: 'Submit to your licensing board within 30 days of issuance to receive credit.',
    },
  },
  {
    id: 'cert-award',
    name: 'Award of Excellence',
    description: 'Gold-accented award certificate for recognition events',
    payload: {
      accent_color: '#B8860B',
      org_logo_position: 'top-center',
      title: 'Award of Excellence',
      body: 'This award is proudly presented to {attendee_name} in recognition of exceptional achievement and dedication demonstrated at {event_title} on {event_date}.',
      footer: 'Presented by {org_name} | Verify at {verification_url}',
      signature_image_url: null,
    },
  },
  {
    id: 'cert-youth',
    name: 'Youth Participation Certificate',
    description: 'Encouraging participation certificate for youth and student events',
    payload: {
      accent_color: '#059669',
      org_logo_position: 'top-center',
      title: 'Certificate of Participation',
      body: 'This certificate is proudly awarded to {attendee_name} for outstanding participation in {event_title} on {event_date}. We are proud of your enthusiasm, curiosity, and commitment throughout every activity.',
      footer: 'Presented by {org_name} | Verify at {verification_url}',
      signature_image_url: null,
    },
  },
]

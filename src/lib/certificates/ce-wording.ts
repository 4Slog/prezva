import type { CertificateTemplatePayload } from '@/lib/templates/certificates'

// F-R2: there is no certificate "type" column. A certificate whose STORED
// ce_credit_hours is 0 (a zero-session event, or sessions that carry no CE
// hours) is an attendance certificate, and no renderer may print CE wording on
// it — no "Continuing Education" title, no "0 CE credit hours" body, no CE box,
// no licensing-board note.

// Credit/session placeholders ({ce_credit_hours}, {{ce_hours}}, {sessions_attended})
// and CE phrases. Placeholder syntax mirrors renderBody's /\{\{?\s*key\s*\}?\}/.
const CE_PLACEHOLDER = /\{\{?\s*(ce_credit_hours|ce_hours|sessions_attended)\s*\}?\}/i
// Phrases are case-insensitive; the acronyms are case-SENSITIVE so an ordinary
// word (French "ce certificat") is not mistaken for CE wording.
const CE_PHRASE = /continuing\s+(professional\s+)?education|professional\s+development\s+(hours?|units?|credits?)|credit\s+hours?|contact\s+hours?|licensing\s+board|\bcredits?\s+earned\b|\bearned\b[^.]*\bcredits?\b/i
const CE_ACRONYM = /\b(CE|CEs|CEU|CEUs|CME|CPE|CLE|PDH|PDHs|PDU|PDUs)\b/

export const ATTENDANCE_TITLE = 'Certificate of Attendance'
export const ATTENDANCE_BODY =
  'This certifies that {attendee_name} attended {event_title} on {event_date}, hosted by {org_name}.'

export function hasCeWording(text: string | null | undefined): boolean {
  if (!text) return false
  return CE_PLACEHOLDER.test(text) || CE_PHRASE.test(text) || CE_ACRONYM.test(text)
}

export function isAttendanceOnly(ceCredits: number | string | null | undefined): boolean {
  return !(Number(ceCredits ?? 0) > 0)
}

// Returns the template to render. Unchanged when the certificate carries CE
// credits; otherwise every CE-worded field is replaced or dropped.
export function templateForCredits(
  template: CertificateTemplatePayload,
  ceCredits: number | string | null | undefined,
): CertificateTemplatePayload {
  if (!isAttendanceOnly(ceCredits)) return template
  return {
    ...template,
    title: hasCeWording(template.title) ? ATTENDANCE_TITLE : template.title,
    subtitle: hasCeWording(template.subtitle) ? undefined : template.subtitle,
    body: hasCeWording(template.body) ? ATTENDANCE_BODY : template.body,
    footer: hasCeWording(template.footer) ? 'Issued by {org_name} | Verify at {verification_url}' : template.footer,
    ce_credits_field: false,
    licensing_body_note: undefined,
  }
}

import { escapeHtml, safeSubject } from '@/lib/email/escape'

// The "new session materials" notice sent to attendees when a speaker uploads
// a handout. Attendee, speaker and organizer text is escaped (O170).
export function handoutEmail(p: { firstName: string; orgName: string; sessionTitle: string; eventTitle: string; agendaUrl: string }): { subject: string; html: string } {
  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:#F0F4F8;font-size:18px;margin:0;">New materials available: ${escapeHtml(p.sessionTitle)}</h1>
      </div>
      <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
        <p style="font-size:15px;">Hi ${escapeHtml(p.firstName)},</p>
        <p style="font-size:15px;">${escapeHtml(p.orgName)} has uploaded new materials for <strong style="color:#F0F4F8;">${escapeHtml(p.sessionTitle)}</strong> at ${escapeHtml(p.eventTitle)}.</p>
        <p style="margin:16px 0;"><a href="${p.agendaUrl}" style="color:#2DD4BF;text-decoration:none;">Download at the agenda page →</a></p>
        <p style="color:#475569;font-size:12px;">Powered by <a href="https://prezva.app" style="color:#2DD4BF;text-decoration:none;">Prezva</a></p>
      </div>
    </div>`
  return { html, subject: safeSubject(`New materials: ${p.sessionTitle} — ${p.eventTitle}`) }
}

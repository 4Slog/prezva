import { escapeHtml } from '@/lib/email/escape'

// The "application received" email for an approval-required registration.
// Attendee and organizer text is escaped (O170).
export function applicationReceivedEmailHtml(p: { attendeeName: string; eventTitle: string; orgName: string; unsubUrl: string }): string {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
        <div style="background:#2DD4BF;width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
          <span style="color:#0D1B2A;font-weight:900;font-size:18px;">P</span>
        </div>
        <h1 style="color:#F0F4F8;font-size:22px;margin:0;">Application received!</h1>
      </div>
      <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
        <p style="font-size:15px;">Hi ${escapeHtml(p.attendeeName)},</p>
        <p style="font-size:15px;">Your registration for <strong style="color:#F0F4F8;">${escapeHtml(p.eventTitle)}</strong> is pending approval. You'll hear from us once the organizer reviews your application.</p>
        <hr style="border:none;border-top:1px solid #1E3A5F;margin:20px 0;" />
        <p style="color:#475569;font-size:12px;margin:0;">Sent by ${escapeHtml(p.orgName)} via <a href="https://prezva.app" style="color:#2DD4BF;text-decoration:none;">Prezva</a>.</p>
        <p style="font-size:11px;color:#475569;text-align:center;margin-top:16px;"><a href="${p.unsubUrl}" style="color:#64748B;">Unsubscribe from all emails</a></p>
      </div>
    </div>
  `
}

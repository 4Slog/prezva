// Shared, presentation-only lookup for announcement status badges.
// Imported by both the client list and the server detail page so the two
// surfaces render identically. Pure module — no client/server-only deps.

export interface AnnouncementBadge {
  label: string
  background: string
  color: string
  border?: string
  dateField: 'scheduled_for' | 'sent_at' | null
}

export function announcementBadge(status: string): AnnouncementBadge {
  switch (status) {
    case 'scheduled':
      return { label: 'Scheduled', background: 'var(--pz-teal-bg)', color: 'var(--pz-teal-ink)', dateField: 'scheduled_for' }
    case 'sending':
      return { label: 'Sending…', background: 'var(--pz-warning-fill)', color: 'var(--pz-surface)', dateField: null }
    case 'sent':
      return { label: 'Sent', background: 'var(--pz-success-bg)', color: 'var(--pz-success)', dateField: 'sent_at' }
    case 'failed':
      return { label: 'Failed', background: 'var(--pz-error-bg)', color: 'var(--pz-error)', dateField: null }
    case 'handed_off':
      return { label: 'Managed in GoHighLevel', background: 'transparent', color: 'var(--pz-muted)', border: '1px solid var(--color-border)', dateField: null }
    case 'draft':
    default:
      return { label: 'Draft', background: 'var(--pz-warning-bg)', color: 'var(--pz-warning)', dateField: null }
  }
}

export const ANNOUNCEMENT_EDITABLE = new Set(['draft', 'scheduled'])

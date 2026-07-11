import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { Field } from '@/components/ui/Field'
import { announcementBadge, ANNOUNCEMENT_EDITABLE } from '@/lib/ui/announcement-status'

type Props = { params: Promise<{ slug: string; id: string }> }

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email only',
  push: 'Push only',
  both: 'Email + Push',
}

export default async function AnnouncementDetailPage({ params }: Props) {
  const { slug, id } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, org_id, slug')
    .eq('slug', slug)
    .single()
  if (!event) notFound()

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', (event as any).org_id)
    .eq('user_id', user.id)
    .single()
  if (!member) redirect('/dashboard')

  const { data: ann } = await supabase
    .from('announcements')
    .select('*')
    .eq('id', id)
    .eq('event_id', (event as any).id)
    .single()
  if (!ann) notFound()

  const badge = announcementBadge(ann.status)
  const isEditable = ANNOUNCEMENT_EDITABLE.has(ann.status)
  const badgeDate =
    badge.dateField === 'scheduled_for' ? ann.scheduled_for
    : badge.dateField === 'sent_at' ? ann.sent_at
    : null

  return (
    <div style={{ padding: '32px', maxWidth: '700px' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link
          href={`/events/${slug}/announcements`}
          style={{ color: 'var(--pz-teal)', fontSize: '14px', textDecoration: 'none' }}
        >
          ← Back to Announcements
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ color: 'var(--pz-text)', fontSize: '22px', fontWeight: 700, margin: 0 }}>
          {isEditable ? 'Edit Announcement' : 'Announcement'}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              background: badge.background,
              color: badge.color,
              border: badge.border,
              borderRadius: '20px',
              padding: '3px 12px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            {badge.label}
          </span>
          {badgeDate && (
            <span style={{ color: 'var(--pz-muted)', fontSize: '12px' }}>
              {new Date(badgeDate).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {isEditable ? (
        <form
          action={async (fd: FormData) => {
            'use server'
            const { createClient: cc } = await import('@/lib/supabase/server')
            const sb = await cc()
            await sb
              .from('announcements')
              .update({ title: fd.get('title'), body: fd.get('body'), channel: fd.get('channel') })
              .eq('id', id)
            const { redirect: redir } = await import('next/navigation')
            redir(`/events/${slug}/announcements`)
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
        >
          <Field label="Subject" htmlFor="ann-edit-title">
            <input
              id="ann-edit-title"
              name="title"
              required
              defaultValue={ann.title}
              maxLength={200}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--pz-border)',
                background: 'var(--pz-surface)',
                color: 'var(--pz-text)',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </Field>
          <Field label="Message" htmlFor="ann-edit-body">
            <textarea
              id="ann-edit-body"
              name="body"
              required
              defaultValue={ann.body}
              rows={6}
              maxLength={2000}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--pz-border)',
                background: 'var(--pz-surface)',
                color: 'var(--pz-text)',
                fontSize: '14px',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </Field>
          <Field label="Channel" htmlFor="ann-edit-channel">
            <select
              id="ann-edit-channel"
              name="channel"
              defaultValue={ann.channel}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--pz-border)',
                background: 'var(--pz-surface)',
                color: 'var(--pz-text)',
                fontSize: '14px',
              }}
            >
              <option value="email">Email only</option>
              <option value="push">Push only</option>
              <option value="both">Email + Push</option>
            </select>
          </Field>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="submit"
              style={{
                background: 'var(--pz-teal)',
                color: 'var(--pz-on-accent)',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Save Changes
            </button>
            <Link
              href={`/events/${slug}/announcements`}
              style={{
                background: 'var(--pz-surface)',
                color: 'var(--pz-muted)',
                border: '1px solid var(--pz-border)',
                borderRadius: '8px',
                padding: '10px 20px',
                fontWeight: 600,
                fontSize: '14px',
                textDecoration: 'none',
              }}
            >
              Cancel
            </Link>
          </div>
        </form>
      ) : (
        <div
          style={{
            background: 'var(--pz-surface)',
            border: '1px solid var(--pz-border)',
            borderRadius: '12px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', color: 'var(--pz-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Subject</div>
            <div style={{ color: 'var(--pz-text)', fontSize: '16px', fontWeight: 600 }}>{ann.title}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--pz-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Message</div>
            <div style={{ color: 'var(--pz-text)', fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{ann.body}</div>
          </div>
          <div style={{ display: 'flex', gap: '32px' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--pz-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Channel</div>
              <div style={{ color: 'var(--pz-text)', fontSize: '14px' }}>{CHANNEL_LABELS[ann.channel] ?? ann.channel}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--pz-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Sent</div>
              <div style={{ color: 'var(--pz-text)', fontSize: '14px' }}>
                {ann.sent_at
                  ? new Date(ann.sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                  : '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--pz-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Recipients</div>
              <div style={{ color: 'var(--pz-text)', fontSize: '14px' }}>{ann.recipient_count ?? 0}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

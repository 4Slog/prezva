import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'

type Props = { params: Promise<{ slug: string }> }

const INTEGRATION_GROUPS = [
  {
    label: 'AMS / Membership',
    integrations: [
      { key: 'wildapricot', name: 'Wild Apricot', icon: '🌿' },
      { key: 'imis',        name: 'iMIS',         icon: '📋' },
      { key: 'memberclicks', name: 'MemberClicks', icon: '🖱️' },
      { key: 'novi',        name: 'Novi AMS',      icon: '🏢' },
      { key: 'yourmembership', name: 'YourMembership', icon: '👥' },
      { key: 'glue-up',    name: 'Glue Up',        icon: '🔗' },
      { key: 'neon',       name: 'Neon CRM',       icon: '💡' },
    ],
  },
  {
    label: 'Communication',
    integrations: [
      { key: 'mailchimp',       name: 'Mailchimp',       icon: '🐵' },
      { key: 'constant-contact', name: 'Constant Contact', icon: '📧' },
      { key: 'zoom',            name: 'Zoom',             icon: '📹' },
      { key: 'teams',           name: 'Microsoft Teams',  icon: '💼' },
    ],
  },
  {
    label: 'Content & Data',
    integrations: [
      { key: 'google-forms',  name: 'Google Forms',  icon: '📝' },
      { key: 'google-drive',  name: 'Google Drive',  icon: '💾' },
      { key: 'eventbrite',    name: 'Eventbrite',    icon: '🎟️' },
      { key: 'sharepoint',    name: 'SharePoint',    icon: '📁' },
      { key: 'outlook',       name: 'Outlook',       icon: '📬' },
    ],
  },
]

const EVENT_ACTIONS = [
  { key: 'zoom',       label: 'Create Zoom meeting for sessions', href: (slug: string) => `/events/${slug}/agenda` },
  { key: 'eventbrite', label: 'Import attendees from Eventbrite', href: (slug: string) => `/events/${slug}/attendees` },
  { key: 'mailchimp',  label: 'Sync announcement list',          href: (slug: string) => `/events/${slug}/announcements` },
]

export default async function EventIntegrationsPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events').select('id, title, org_id').eq('slug', slug).single()
  if (!event) notFound()

  const { data: member } = await supabase
    .from('org_members').select('role, orgs(slug)')
    .eq('org_id', (event as any).org_id).eq('user_id', user.id).single()
  if (!member) notFound()

  const orgSlug = (member as any).orgs?.slug ?? ''

  const { data: integrations } = await supabase
    .from('org_integrations')
    .select('provider, status')
    .eq('org_id', (event as any).org_id)

  const statusMap: Record<string, string> = {}
  for (const row of integrations ?? []) statusMap[row.provider] = row.status

  const cardStyle = {
    background: 'var(--pz-surface)',
    border: '1px solid var(--pz-border)',
    borderRadius: 10,
    padding: '0.875rem 1rem',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href={`/events/${slug}`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>
          ← {(event as any).title}
        </Link>
        <span style={{ color: 'var(--pz-border)' }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--pz-text)' }}>Integrations</span>
      </div>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pz-text)', marginBottom: 4 }}>Integrations</h1>
        <p style={{ fontSize: 13, color: 'var(--pz-muted)' }}>
          Connect your tools.{' '}
          <Link href={`/orgs/${orgSlug}/integrations`} style={{ color: 'var(--pz-teal)' }}>
            Configure integrations at the org level →
          </Link>
        </p>
      </div>

      {INTEGRATION_GROUPS.map(group => (
        <div key={group.label} style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            {group.label}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {group.integrations.map(int => {
              const status = statusMap[int.key] ?? 'available'
              const connected = status === 'connected'
              return (
                <div key={int.key} style={cardStyle}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{int.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--pz-text)' }}>{int.name}</p>
                    <p style={{ fontSize: 11, color: connected ? '#22c55e' : 'var(--pz-muted)', fontWeight: 600 }}>
                      {connected ? '● Connected' : '○ Not connected'}
                    </p>
                  </div>
                  <Link
                    href={`/orgs/${orgSlug}/integrations`}
                    style={{ fontSize: 11, color: 'var(--pz-teal)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                  >
                    Configure
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* SMS Notifications */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          SMS Notifications
        </p>
        <p style={{ fontSize: 12, color: 'var(--pz-muted)', marginBottom: 12 }}>
          Send attendees SMS notifications for announcements, reminders, and event updates.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Tier 1 — Prezva SMS */}
          <div style={{ ...cardStyle, flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 22 }}>📱</span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>
                    Prezva SMS <span style={{ fontSize: 11, color: 'var(--pz-muted)', fontWeight: 400 }}>(Recommended)</span>
                  </p>
                  <span style={{ display: 'inline-block', marginTop: 3, fontSize: 10, fontWeight: 700, background: '#1E3A5F', color: '#94A3B8', borderRadius: 4, padding: '1px 6px' }}>
                    Powered by Telnyx
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, background: '#F59E0B22', color: '#F59E0B', borderRadius: 12, padding: '2px 10px', whiteSpace: 'nowrap' }}>
                Pending carrier approval
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: 0 }}>
              Use Prezva&apos;s built-in SMS number (+1-770-520-7799) to send notifications. No setup required. Includes 10DLC compliance.
            </p>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--pz-muted)', lineHeight: 1.7 }}>
              <li>Automatic 10DLC compliance</li>
              <li>Shared Prezva sender number</li>
              <li>Included in your plan</li>
            </ul>
            <p style={{ margin: 0, fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>
              SMS delivery begins once carrier campaign CRX9TO7 is approved (typically 2–4 weeks)
            </p>
          </div>
          {/* Tier 2 — Own number (coming soon) */}
          <div style={{ ...cardStyle, flexDirection: 'column', alignItems: 'flex-start', gap: 10, opacity: 0.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 22 }}>🔢</span>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>Your own number</p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, background: '#1E3A5F', color: '#64748B', borderRadius: 12, padding: '2px 10px', whiteSpace: 'nowrap' }}>
                Coming soon
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: 0 }}>
              Connect your own Telnyx or Twilio number to send SMS from your organization&apos;s dedicated number.
            </p>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--pz-muted)', lineHeight: 1.7 }}>
              <li>Custom sender number</li>
              <li>Higher throughput</li>
              <li>Brand recognition</li>
            </ul>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 8, padding: '1.25rem 1.5rem', background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 14 }}>Event Actions</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {EVENT_ACTIONS.map(action => (
            <div key={action.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--pz-text)' }}>{action.label}</p>
              <Link
                href={action.href(slug)}
                style={{ fontSize: 12, color: 'var(--pz-teal)', textDecoration: 'none', border: '1px solid var(--pz-teal)', borderRadius: 6, padding: '3px 10px', whiteSpace: 'nowrap' }}
              >
                Go →
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

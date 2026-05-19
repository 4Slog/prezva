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

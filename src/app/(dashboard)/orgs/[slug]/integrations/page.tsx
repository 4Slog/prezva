import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { listAdapters } from '@/lib/integrations/_shared/registry'
import { mailchimpAdapter } from '@/lib/integrations/mailchimp/adapter'
import Link from 'next/link'
import { IntegrationsClient } from './integrations-client'

type Props = { params: Promise<{ slug: string }> }

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  connected: { label: 'Connected', bg: '#2DD4BF', color: '#0D1B2A' },
  available: { label: 'Not connected', bg: '#1E3A5F', color: '#94A3B8' },
  awaiting_credentials: { label: 'Needs setup', bg: 'var(--pz-warning-fill)', color: '#0D1B2A' },
  error: { label: 'Error', bg: 'var(--pz-error)', color: '#fff' },
}

const SECTION_MAP: Record<string, string> = {
  mailchimp: 'Communications',
  constant_contact: 'Communications',
  outlook: 'Calendaring',
  teams: 'Video Conferencing',
  zoom: 'Video Conferencing',
  google_drive: 'File Storage',
  sharepoint: 'File Storage',
  eventbrite: 'Event Import',
  google_forms: 'Survey Import',
  wildapricot: 'Member Associations',
  imis: 'Member Associations',
  memberclicks: 'Member Associations',
  yourmembership: 'Member Associations',
  glue_up: 'Member Associations',
  neon: 'Member Associations',
  novi: 'Member Associations',
}

const SECTION_ORDER = [
  'Communications',
  'Calendaring',
  'Video Conferencing',
  'File Storage',
  'Event Import',
  'Survey Import',
  'Member Associations',
]

const ASSOCIATION_PROVIDERS = new Set(['wildapricot', 'imis', 'memberclicks', 'yourmembership', 'glue_up', 'neon', 'novi'])

export default async function OrgIntegrationsPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug, org_members!inner(user_id, role)')
    .eq('slug', slug)
    .eq('org_members.user_id', user.id)
    .maybeSingle()

  if (!org) redirect('/dashboard')

  const orgId = (org as any).id

  const adapters = listAdapters()

  const { data: orgIntegrations } = await supabase
    .from('org_integrations')
    .select('provider, status, last_synced_at, directionality_preferences')
    .eq('org_id', orgId)

  const integrationMap: Record<string, { status: string; last_synced_at: string | null; directionality_preferences: unknown }> = {}
  for (const row of orgIntegrations ?? []) {
    integrationMap[row.provider] = row
  }

  // Load Mailchimp lists if connected
  let mailchimpLists: { id: string; name: string; memberCount: number }[] = []
  let defaultMailchimpListId: string | null = null
  if (integrationMap['mailchimp']?.status === 'connected') {
    try { mailchimpLists = await mailchimpAdapter.getLists(orgId) } catch { /* non-fatal */ }
    defaultMailchimpListId = (integrationMap['mailchimp']?.directionality_preferences as any)?.defaultListId ?? null
  }

  // Build rows grouped by section
  const sectionMap: Record<string, typeof rows> = {}
  const rows = adapters.map(adapter => {
    const dbRow = integrationMap[adapter.provider]
    const isConfigured = adapter.isConfigured()
    const statusKey = dbRow?.status ?? (isConfigured ? 'available' : 'awaiting_credentials')
    return {
      provider: adapter.provider,
      displayName: adapter.displayName,
      statusKey,
      badge: STATUS_BADGE[statusKey] ?? STATUS_BADGE.available,
      isConfigured,
      isConnected: statusKey === 'connected',
      lastSyncedAt: dbRow?.last_synced_at ?? null,
      hasVerifyMembership: ASSOCIATION_PROVIDERS.has(adapter.provider),
    }
  })

  for (const row of rows) {
    const section = SECTION_MAP[row.provider] ?? 'Other'
    if (!sectionMap[section]) sectionMap[section] = []
    sectionMap[section].push(row)
  }

  const sections = SECTION_ORDER
    .filter(s => sectionMap[s]?.length)
    .map(s => ({ title: s, integrations: sectionMap[s] }))

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/orgs/${slug}/settings`} className="text-sm text-[#64748B] hover:text-[#94A3B8]">
          ← {(org as any).name}
        </Link>
        <span className="text-[#1E3A5F]">/</span>
        <span className="text-sm text-[#F0F4F8]">Integrations</span>
      </div>

      <h1 className="text-xl font-bold text-[#F0F4F8] mb-2">Integrations</h1>
      <p className="text-sm text-[#64748B] mb-6">
        Connect external services to sync attendees, import events, and verify memberships.
        Credentials are managed via environment variables — contact your administrator to enable new integrations.
      </p>

      <IntegrationsClient
        sections={sections}
        orgId={orgId}
        orgSlug={slug}
        mailchimpLists={mailchimpLists}
        defaultMailchimpListId={defaultMailchimpListId}
      />
    </div>
  )
}

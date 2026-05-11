import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { listAdapters } from '@/lib/integrations/_shared/registry'
import Link from 'next/link'

type Props = { params: Promise<{ slug: string }> }

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  connected: { label: 'Connected', bg: '#00BFA6', color: '#0D1B2A' },
  available: { label: 'Not connected', bg: '#1E3A5F', color: '#94A3B8' },
  awaiting_credentials: { label: 'Needs setup', bg: '#F59E0B', color: '#0D1B2A' },
  error: { label: 'Error', bg: '#EF4444', color: '#fff' },
}

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

  const adapters = listAdapters()

  const { data: orgIntegrations } = await supabase
    .from('org_integrations')
    .select('provider, status')
    .eq('org_id', (org as any).id)

  const statusMap: Record<string, string> = {}
  for (const row of orgIntegrations ?? []) {
    statusMap[row.provider] = row.status
  }

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
        Connect external services to sync sessions, attendees, and more.
        Credentials are managed via environment variables — contact your administrator to enable new integrations.
      </p>

      <div className="space-y-3">
        {adapters.map(adapter => {
          const dbStatus = statusMap[adapter.provider]
          const isConfigured = adapter.isConfigured()
          const statusKey = dbStatus ?? (isConfigured ? 'available' : 'awaiting_credentials')
          const badge = STATUS_BADGE[statusKey] ?? STATUS_BADGE.available
          const isConnected = statusKey === 'connected'

          return (
            <div key={adapter.provider} className="pz-card p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#F0F4F8]">{adapter.displayName}</p>
                <span
                  className="inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ background: badge.bg, color: badge.color }}
                >
                  {badge.label}
                </span>
              </div>
              <div className="flex gap-2">
                {isConfigured && !isConnected && (
                  <a
                    href={`/api/integrations/${adapter.provider}/auth?org_id=${(org as any).id}`}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                    style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
                  >
                    Connect
                  </a>
                )}
                {isConnected && (
                  <form action={async () => {
                    'use server'
                    const { getAdapter } = await import('@/lib/integrations/_shared/registry')
                    const a = getAdapter(adapter.provider)
                    await a.disconnect((org as any).id)
                  }}>
                    <button
                      type="submit"
                      className="rounded-lg border border-[#EF4444]/30 px-3 py-1.5 text-xs text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors"
                    >
                      Disconnect
                    </button>
                  </form>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

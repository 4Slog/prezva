import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { listOrgTemplates } from '@/lib/templates/actions'
import { getEventTemplates } from '@/lib/productivity/sprint11-actions'
import { getOrgPermissions } from '@/lib/auth/assert-permission'
import { OrgTemplatesClient } from './client'

type Props = { params: Promise<{ slug: string }> }

export default async function OrgTemplatesPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('slug', slug)
    .single()
  if (!org) notFound()

  const [templates, eventTemplates, permSet] = await Promise.all([
    listOrgTemplates((org as any).id),
    getEventTemplates((org as any).id),
    getOrgPermissions((org as any).id, user.id),
  ])
  const permissions = Array.from(permSet)

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href={`/orgs/${slug}/settings`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>← Settings</a>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--pz-text)', marginTop: 8 }}>Template Library</h1>
        <p style={{ color: 'var(--pz-muted)', fontSize: 14, marginTop: 4 }}>
          Saved templates for {(org as any).name} — reuse them across events
        </p>
      </div>
      <OrgTemplatesClient templates={templates} eventTemplates={eventTemplates} orgSlug={slug} permissions={permissions} />
    </div>
  )
}

import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { listOrgCertificateTemplates } from '@/lib/certificates/actions'
import { CertificatesClient } from './client'

type Props = { params: Promise<{ slug: string }> }

export default async function OrgCertificatesPage({ params }: Props) {
  const { slug } = await params
  await requireUser()

  // Admin client: org lookup for certificate template management
  const admin = createAdminClient()
  const { data: org } = await admin.from('organizations').select('id, name').eq('slug', slug).maybeSingle()
  if (!org) return <div style={{ padding: '2rem', color: 'var(--pz-muted)' }}>Organization not found.</div>

  const templates = await listOrgCertificateTemplates(org.id)

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 4 }}>Certificate Templates</h1>
          <p style={{ fontSize: 14, color: 'var(--pz-muted)' }}>Design branded certificates for event attendees.</p>
        </div>
      </div>
      <CertificatesClient orgId={org.id} templates={templates} />
    </div>
  )
}

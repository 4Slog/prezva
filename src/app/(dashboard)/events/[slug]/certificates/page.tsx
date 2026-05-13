import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'

type Props = { params: Promise<{ slug: string }> }

export default async function CertificatesPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, org_id, slug, certificate_enabled, certificate_min_session_attendance_pct, certificate_template_id')
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

  const { data: templates } = await supabase
    .from('certificate_templates')
    .select('id, name, is_default, created_at')
    .eq('org_id', (event as any).org_id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  const templateIds = (templates ?? []).map((t: any) => t.id)
  const issuedCounts: Record<string, number> = {}
  if (templateIds.length > 0) {
    const { data: counts } = await supabase
      .from('issued_certificates')
      .select('template_id')
      .eq('event_id', (event as any).id)
      .in('template_id', templateIds)
    if (counts) {
      for (const row of counts as any[]) {
        issuedCounts[row.template_id] = (issuedCounts[row.template_id] ?? 0) + 1
      }
    }
  }

  const minPct = (event as any).certificate_min_session_attendance_pct ?? 60

  return (
    <div style={{ padding: '32px', maxWidth: '900px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: 'var(--pz-text)', fontSize: '22px', fontWeight: 700, margin: 0 }}>
            Certificates
          </h1>
          <p style={{ color: 'var(--pz-muted)', fontSize: '14px', marginTop: '4px' }}>
            Issue certificates of attendance to qualified attendees
          </p>
        </div>
        <button
          style={{
            background: 'var(--pz-teal)',
            color: '#0D1B2A',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 16px',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          + New Template
        </button>
      </div>

      <div
        style={{
          background: 'var(--pz-surface)',
          border: '1px solid var(--pz-border)',
          borderRadius: '10px',
          padding: '16px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div style={{ fontSize: '13px', color: 'var(--pz-muted)' }}>
          <span style={{ color: 'var(--pz-text)', fontWeight: 600 }}>Eligibility: </span>
          Attendees who completed ≥{minPct}% of sessions
        </div>
        <div
          style={{
            marginLeft: 'auto',
            background: (event as any).certificate_enabled ? '#00BFA620' : 'var(--pz-border)',
            color: (event as any).certificate_enabled ? '#00BFA6' : 'var(--pz-muted)',
            borderRadius: '20px',
            padding: '2px 10px',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          {(event as any).certificate_enabled ? 'Enabled' : 'Disabled'}
        </div>
      </div>

      {!templates || templates.length === 0 ? (
        <div
          style={{
            background: 'var(--pz-surface)',
            border: '1px dashed var(--pz-border)',
            borderRadius: '12px',
            padding: '48px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎓</div>
          <h3 style={{ color: 'var(--pz-text)', margin: '0 0 8px' }}>No certificate templates yet</h3>
          <p style={{ color: 'var(--pz-muted)', fontSize: '14px', margin: '0 0 20px' }}>
            Create a template to start issuing certificates to qualified attendees.
          </p>
          <button
            style={{
              background: 'var(--pz-teal)',
              color: '#0D1B2A',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Create your first template
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {(templates as any[]).map((tmpl) => (
            <div
              key={tmpl.id}
              style={{
                background: 'var(--pz-surface)',
                border: '1px solid var(--pz-border)',
                borderRadius: '10px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'var(--pz-text)', fontWeight: 600, fontSize: '15px' }}>
                    {tmpl.name}
                  </span>
                  {tmpl.is_default && (
                    <span
                      style={{
                        background: '#00BFA620',
                        color: '#00BFA6',
                        borderRadius: '20px',
                        padding: '1px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      Default
                    </span>
                  )}
                </div>
                <div style={{ color: 'var(--pz-muted)', fontSize: '13px', marginTop: '2px' }}>
                  {issuedCounts[tmpl.id] ?? 0} issued for this event
                </div>
              </div>
              <button
                style={{
                  background: 'transparent',
                  border: '1px solid var(--pz-border)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  color: 'var(--pz-muted)',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { getOrgPermissions } from '@/lib/auth/assert-permission'
import BulkIssueButton from './bulk-issue-button'
import { countPublishedSessions } from '@/lib/certificates/published-sessions'
import { ZeroSessionCertificateWarning } from '@/components/certificates/ZeroSessionCertificateWarning'

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

  const permSet = await getOrgPermissions((event as any).org_id, user.id)
  const permissions = Array.from(permSet)

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

  // R62: the size of what the bulk button will queue. Confirmed registrations,
  // NOT eligible attendees — eligibility is decided per registration inside the
  // background sweep, and this count is only ever shown as a confirmed count.
  // head+exact so it costs a count, not a row fetch.
  //
  // ADMIN CLIENT, NOT `supabase`. The RLS policy on registrations
  // (registrations_select, migration 0096) requires attendees.view, but this
  // button is gated on certificates.manage — two independent permission keys.
  // A role holding only certificates.manage would read count 0 through the
  // session client with NO error, the modal would offer to "queue 0 confirmed
  // attendees", and the sweep — which runs service-role and sees every row —
  // would then issue to all of them. The organizer would have confirmed a
  // no-op and triggered a mass issuance. The count shown must come from the
  // same vantage point as the work it describes.
  //
  // Safe because the page has already established the viewer is a member of
  // this event's org (org_members check above); this widens the count only,
  // and reveals nothing beyond a single integer the button is authorized for.
  const { count: confirmedCount } = await createAdminClient()
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', (event as any).id)
    .eq('status', 'confirmed')

  const minPct = (event as any).certificate_min_session_attendance_pct ?? 60
  // F-R6: admin client for the same reason as confirmedCount above — the
  // session client's sessions_select policy hides sessions from roles without
  // agenda.view, which would show the zero-session warning on an event that
  // has sessions. Membership was established above; this reveals a count only.
  const publishedSessions = await countPublishedSessions(createAdminClient(), event.id)

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
        <div style={{ display: 'flex', gap: 8 }}>
          <BulkIssueButton eventId={(event as any).id} confirmedCount={confirmedCount ?? 0} permissions={permissions} />
          <button
            style={{
              background: 'var(--pz-teal)',
              color: 'var(--pz-on-accent)',
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
            background: (event as any).certificate_enabled ? 'var(--pz-teal-bg)' : 'var(--pz-border)',
            color: (event as any).certificate_enabled ? 'var(--pz-teal-ink)' : 'var(--pz-muted)',
            borderRadius: '20px',
            padding: '2px 10px',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          {(event as any).certificate_enabled ? 'Enabled' : 'Disabled'}
        </div>
      </div>

      <ZeroSessionCertificateWarning
        certificatesEnabled={event.certificate_enabled}
        publishedSessions={publishedSessions}
      />

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
              color: 'var(--pz-on-accent)',
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
                        background: 'var(--pz-teal-bg)',
                        color: 'var(--pz-teal-ink)',
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

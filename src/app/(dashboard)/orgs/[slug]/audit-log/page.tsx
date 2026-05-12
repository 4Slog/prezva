import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

type Props = { params: Promise<{ slug: string }> }

export default async function OrgAuditLogPage({ params }: Props) {
  const { slug } = await params
  await requireUser()

  // Admin client: audit log requires elevated read access across all org events
  const admin = createAdminClient()
  const { data: org } = await admin.from('organizations').select('id, name').eq('slug', slug).maybeSingle()

  const { data: logs } = org ? await admin
    .from('audit_logs')
    .select('id, action, table_name, event_id, created_at, user_id, events(title, slug)')
    .eq('org_id', org.id)
    .order('created_at', { ascending: false })
    .limit(200) : { data: [] }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 4 }}>Audit Log</h1>
          <p style={{ fontSize: 14, color: 'var(--pz-muted)' }}>All admin actions across {org?.name ?? slug}</p>
        </div>
      </div>

      {!logs || logs.length === 0 ? (
        <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '2rem', color: 'var(--pz-muted)', fontSize: 14 }}>
          No audit entries yet.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--pz-border)' }}>
                {['Timestamp', 'Action', 'Table', 'Event', 'User'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--pz-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(logs as any[]).map(log => {
                const ev = log.events
                return (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--pz-border)' }} className="hover:bg-[#ffffff08]">
                    <td style={{ padding: '8px 12px', color: 'var(--pz-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ fontSize: 11, background: 'var(--pz-teal)22', color: 'var(--pz-teal)', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--pz-text)' }}>{log.table_name ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {ev?.slug ? (
                        <Link href={`/events/${ev.slug}`} style={{ color: 'var(--pz-teal)', textDecoration: 'none', fontSize: 11 }}>{ev.title}</Link>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--pz-muted)', fontFamily: 'monospace', fontSize: 10 }}>{log.user_id?.slice(0, 8) ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

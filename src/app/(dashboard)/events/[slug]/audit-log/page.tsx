import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

type Props = { params: Promise<{ slug: string }> }

export default async function EventAuditLogPage({ params }: Props) {
  const { slug } = await params
  await requireUser()

  // Admin client: audit log reads require elevated access
  const admin = createAdminClient()
  const { data: event } = await admin.from('events').select('id, title').eq('slug', slug).maybeSingle()

  const { data: logs } = event ? await admin
    .from('audit_logs')
    .select('id, action, table_name, created_at, user_id, old_data, new_data')
    .eq('event_id', event.id)
    .order('created_at', { ascending: false })
    .limit(100) : { data: [] }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href={`/events/${slug}`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>
          ← {event?.title ?? slug}
        </Link>
        <span style={{ color: 'var(--pz-border)' }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--pz-text)' }}>Audit Log</span>
      </div>

      <h1 className="text-xl font-bold text-[#F0F4F8] mb-6">Audit Log</h1>

      {!logs || logs.length === 0 ? (
        <div className="pz-card p-6">
          <p style={{ fontSize: 14, color: 'var(--pz-muted)' }}>No audit log entries for this event.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--pz-border)' }}>
                {['Timestamp', 'Action', 'Table', 'User ID'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--pz-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(logs as any[]).map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--pz-border)', transition: 'background 0.1s' }} className="hover:bg-[#ffffff08]">
                  <td style={{ padding: '8px 12px', color: 'var(--pz-muted)' }}>
                    {new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 11, background: 'var(--pz-teal)22', color: 'var(--pz-teal)', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--pz-text)' }}>{log.table_name ?? '—'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--pz-muted)', fontFamily: 'monospace', fontSize: 10 }}>{log.user_id?.slice(0, 8) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

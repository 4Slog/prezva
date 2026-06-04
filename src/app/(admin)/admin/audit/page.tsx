import { requireAdmin } from '@/lib/admin/gate'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

const ACTIONS = ['create', 'update', 'delete', 'login', 'logout', 'checkin', 'register', 'payment', 'export']

export default async function AdminAuditPage({ searchParams }: {
  searchParams: Promise<{ page?: string; action?: string; org?: string }>
}) {
  await requireAdmin()
  const { page: pageStr, action, org } = await searchParams
  const page = Math.max(1, parseInt(pageStr ?? '1', 10))
  const pageSize = 50
  const from = (page - 1) * pageSize
  const admin = createAdminClient()

  let query = admin
    .from('audit_logs')
    .select('id, action, table_name, record_id, ip_address, created_at, org_id, user_id, organizations(name), profiles(email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1)

  if (action) query = (query as any).eq('action', action)
  if (org) query = (query as any).eq('org_id', org)

  const { data: logs, count } = await query
  const totalPages = Math.ceil((count ?? 0) / pageSize)

  const actionColors: Record<string, string> = {
    create: 'bg-green-100 text-green-700',
    update: 'bg-blue-100 text-blue-700',
    delete: 'bg-red-100 text-red-700',
    login: 'bg-[var(--pz-teal-bg)] text-[var(--pz-teal-ink)]',
    logout: 'bg-[var(--pz-surface-2)] text-[var(--pz-label)]',
    checkin: 'bg-purple-100 text-purple-700',
    register: 'bg-yellow-100 text-yellow-700',
    payment: 'bg-orange-100 text-orange-700',
    export: 'bg-[var(--pz-surface-2)] text-[var(--pz-muted)]',
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--pz-text)]">Audit Log ({count ?? 0})</h1>
        <form method="GET" className="flex gap-2">
          <select
            name="action"
            defaultValue={action ?? ''}
            className="bg-[var(--pz-bg)] border border-[var(--pz-border)] rounded-lg px-3 py-2 text-sm text-[var(--pz-text)] focus:outline-none focus:border-[var(--pz-teal)]"
          >
            <option value="">All actions</option>
            {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button type="submit" className="px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] text-sm text-[var(--pz-text)] hover:bg-[var(--pz-border)]">Filter</button>
        </form>
      </div>
      <div className="rounded-xl border border-[var(--pz-border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--pz-surface-2)]">
            <tr>
              {['Time', 'Action', 'User', 'Organization', 'Table', 'IP'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--pz-label)] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--pz-border)]">
            {(logs ?? []).map((log: any) => (
              <tr key={log.id} className="bg-[var(--pz-surface)] hover:bg-[var(--pz-surface-2)]">
                <td className="px-4 py-3 text-[var(--pz-label)] font-mono text-xs whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${actionColors[log.action] ?? 'bg-[var(--pz-surface-2)] text-[var(--pz-muted)]'}`}>
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--pz-muted)] text-xs">
                  {log.profiles ? (log.profiles as any).email : '—'}
                </td>
                <td className="px-4 py-3 text-[var(--pz-label)] text-xs">
                  {log.organizations ? (
                    <Link href={`/admin/orgs/${log.org_id}`} className="hover:text-[var(--pz-teal-ink)]">
                      {(log.organizations as any).name}
                    </Link>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-[var(--pz-label)] font-mono text-xs">{log.table_name ?? '—'}</td>
                <td className="px-4 py-3 text-[var(--pz-label)] font-mono text-xs">{log.ip_address ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <Link key={p} href={`?page=${p}${action ? `&action=${action}` : ''}${org ? `&org=${org}` : ''}`}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm ${p === page ? 'bg-[var(--pz-teal)] text-[var(--pz-on-accent)]' : 'bg-[var(--pz-surface-2)] text-[var(--pz-muted)] hover:bg-[var(--pz-border)]'}`}>
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

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
    create: 'bg-green-900/40 text-green-400',
    update: 'bg-blue-900/40 text-blue-400',
    delete: 'bg-red-900/40 text-red-400',
    login: 'bg-[#2DD4BF]/10 text-[#2DD4BF]',
    logout: 'bg-[#1E3A5F] text-[#64748B]',
    checkin: 'bg-purple-900/40 text-purple-400',
    register: 'bg-yellow-900/40 text-yellow-400',
    payment: 'bg-orange-900/40 text-orange-400',
    export: 'bg-[#1E3A5F] text-[#94A3B8]',
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#F0F4F8]">Audit Log ({count ?? 0})</h1>
        <form method="GET" className="flex gap-2">
          <select
            name="action"
            defaultValue={action ?? ''}
            className="bg-[#0D1B2A] border border-[#1E3A5F] rounded-lg px-3 py-2 text-sm text-[#F0F4F8] focus:outline-none focus:border-[#2DD4BF]"
          >
            <option value="">All actions</option>
            {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button type="submit" className="px-3 py-2 rounded-lg bg-[#1E3A5F] text-sm text-[#F0F4F8] hover:bg-[#2A4F7A]">Filter</button>
        </form>
      </div>
      <div className="rounded-xl border border-[#1E3A5F] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#071629]">
            <tr>
              {['Time', 'Action', 'User', 'Organization', 'Table', 'IP'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E3A5F]">
            {(logs ?? []).map((log: any) => (
              <tr key={log.id} className="bg-[#112240] hover:bg-[#1E3A5F]/20">
                <td className="px-4 py-3 text-[#64748B] font-mono text-xs whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${actionColors[log.action] ?? 'bg-[#1E3A5F] text-[#94A3B8]'}`}>
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#94A3B8] text-xs">
                  {log.profiles ? (log.profiles as any).email : '—'}
                </td>
                <td className="px-4 py-3 text-[#64748B] text-xs">
                  {log.organizations ? (
                    <Link href={`/admin/orgs/${log.org_id}`} className="hover:text-[#2DD4BF]">
                      {(log.organizations as any).name}
                    </Link>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-[#64748B] font-mono text-xs">{log.table_name ?? '—'}</td>
                <td className="px-4 py-3 text-[#64748B] font-mono text-xs">{log.ip_address ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <Link key={p} href={`?page=${p}${action ? `&action=${action}` : ''}${org ? `&org=${org}` : ''}`}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm ${p === page ? 'bg-[#2DD4BF] text-[#0D1B2A]' : 'bg-[#1E3A5F] text-[#94A3B8] hover:bg-[#2A4F7A]'}`}>
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

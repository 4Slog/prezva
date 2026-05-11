import { requireAdmin } from '@/lib/admin/gate'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

export default async function AdminEventsPage({ searchParams }: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>
}) {
  await requireAdmin()
  const { page: pageStr, search, status } = await searchParams
  const page = Math.max(1, parseInt(pageStr ?? '1', 10))
  const pageSize = 25
  const from = (page - 1) * pageSize
  const admin = createAdminClient()

  let query = admin
    .from('events')
    .select('id, title, slug, status, event_type, start_at, registration_count, org_id, organizations(name, slug)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1)

  if (search) query = (query as any).ilike('title', `%${search}%`)
  if (status) query = (query as any).eq('status', status)

  const { data: events, count } = await query
  const totalPages = Math.ceil((count ?? 0) / pageSize)

  const statusColors: Record<string, string> = {
    draft: 'bg-[#1E3A5F] text-[#94A3B8]',
    published: 'bg-[#00BFA6]/10 text-[#00BFA6]',
    live: 'bg-green-900/40 text-green-400',
    ended: 'bg-[#1E3A5F] text-[#64748B]',
    archived: 'bg-[#1E3A5F] text-[#64748B]',
    cancelled: 'bg-red-900/40 text-red-400',
  }

  const statuses = ['draft', 'published', 'live', 'ended', 'archived', 'cancelled']

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#F0F4F8]">Events ({count ?? 0})</h1>
        <form method="GET" className="flex gap-2">
          <select
            name="status"
            defaultValue={status ?? ''}
            className="bg-[#0D1B2A] border border-[#1E3A5F] rounded-lg px-3 py-2 text-sm text-[#F0F4F8] focus:outline-none focus:border-[#00BFA6]"
          >
            <option value="">All statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            name="search"
            defaultValue={search}
            placeholder="Search by title…"
            className="bg-[#0D1B2A] border border-[#1E3A5F] rounded-lg px-3 py-2 text-sm text-[#F0F4F8] focus:outline-none focus:border-[#00BFA6] w-56"
          />
          <button type="submit" className="px-3 py-2 rounded-lg bg-[#1E3A5F] text-sm text-[#F0F4F8] hover:bg-[#2A4F7A]">Filter</button>
        </form>
      </div>
      <div className="rounded-xl border border-[#1E3A5F] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#071629]">
            <tr>
              {['Title', 'Organization', 'Type', 'Status', 'Start Date', 'Registrations'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E3A5F]">
            {(events ?? []).map((ev: any) => (
              <tr key={ev.id} className="bg-[#112240] hover:bg-[#1E3A5F]/20">
                <td className="px-4 py-3 text-[#F0F4F8] font-medium max-w-xs truncate">{ev.title}</td>
                <td className="px-4 py-3 text-[#64748B]">
                  {ev.organizations ? (
                    <Link href={`/admin/orgs/${ev.org_id}`} className="hover:text-[#00BFA6]">
                      {(ev.organizations as any).name}
                    </Link>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-[#64748B] capitalize">{ev.event_type?.replace('_', ' ')}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${statusColors[ev.status] ?? 'bg-[#1E3A5F] text-[#94A3B8]'}`}>
                    {ev.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#64748B]">{new Date(ev.start_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-[#94A3B8]">{ev.registration_count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <Link key={p} href={`?page=${p}${search ? `&search=${search}` : ''}${status ? `&status=${status}` : ''}`}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm ${p === page ? 'bg-[#00BFA6] text-[#0D1B2A]' : 'bg-[#1E3A5F] text-[#94A3B8] hover:bg-[#2A4F7A]'}`}>
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

import { requireAdmin } from '@/lib/admin/gate'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

export default async function AdminOrgsPage({ searchParams }: {
  searchParams: Promise<{ page?: string; search?: string }>
}) {
  await requireAdmin()
  const { page: pageStr, search } = await searchParams
  const page = Math.max(1, parseInt(pageStr ?? '1', 10))
  const pageSize = 25
  const from = (page - 1) * pageSize
  const admin = createAdminClient()

  let query = admin
    .from('organizations')
    .select('id, name, slug, created_at, suspended, deleted_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1)

  if (search) query = (query as any).ilike('name', `%${search}%`)

  const { data: orgs, count } = await query
  const totalPages = Math.ceil((count ?? 0) / pageSize)

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#F0F4F8]">Organizations ({count ?? 0})</h1>
        <form method="GET" className="flex gap-2">
          <input
            name="search"
            defaultValue={search}
            placeholder="Search by name…"
            className="bg-[#0D1B2A] border border-[#1E3A5F] rounded-lg px-3 py-2 text-sm text-[#F0F4F8] focus:outline-none focus:border-[#00BFA6] w-56"
          />
          <button type="submit" className="px-3 py-2 rounded-lg bg-[#1E3A5F] text-sm text-[#F0F4F8] hover:bg-[#2A4F7A]">Search</button>
        </form>
      </div>
      <div className="rounded-xl border border-[#1E3A5F] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#071629]">
            <tr>
              {['Name', 'Slug', 'Created', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E3A5F]">
            {(orgs ?? []).map((org: any) => (
              <tr key={org.id} className="bg-[#112240] hover:bg-[#1E3A5F]/20">
                <td className="px-4 py-3 text-[#F0F4F8] font-medium">{org.name}</td>
                <td className="px-4 py-3 text-[#64748B] font-mono text-xs">{org.slug}</td>
                <td className="px-4 py-3 text-[#64748B]">{new Date(org.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  {org.deleted_at
                    ? <span className="px-2 py-0.5 rounded-full text-xs bg-red-900/40 text-red-400">Deleted</span>
                    : org.suspended
                    ? <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-900/40 text-yellow-400">Suspended</span>
                    : <span className="px-2 py-0.5 rounded-full text-xs bg-[#00BFA6]/10 text-[#00BFA6]">Active</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link href={`/admin/orgs/${org.id}`} className="text-xs text-[#00BFA6] hover:underline">View</Link>
                    {!org.suspended && !org.deleted_at && (
                      <form action={`/api/admin/orgs/${org.id}/suspend`} method="POST">
                        <button type="submit" className="text-xs text-yellow-400 hover:underline">Suspend</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <Link key={p} href={`?page=${p}${search ? `&search=${search}` : ''}`}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm ${p === page ? 'bg-[#00BFA6] text-[#0D1B2A]' : 'bg-[#1E3A5F] text-[#94A3B8] hover:bg-[#2A4F7A]'}`}>
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

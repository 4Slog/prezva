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
        <h1 className="text-xl font-bold text-[var(--pz-text)]">Organizations ({count ?? 0})</h1>
        <form method="GET" className="flex gap-2">
          <input
            name="search"
            defaultValue={search}
            placeholder="Search by name…"
            className="bg-[var(--pz-bg)] border border-[var(--pz-border)] rounded-lg px-3 py-2 text-sm text-[var(--pz-text)] focus:outline-none focus:border-[var(--pz-teal)] w-56"
          />
          <button type="submit" className="px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] text-sm text-[var(--pz-text)] hover:bg-[var(--pz-border)]">Search</button>
        </form>
      </div>
      <div className="rounded-xl border border-[var(--pz-border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--pz-surface-2)]">
            <tr>
              {['Name', 'Slug', 'Created', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--pz-label)] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--pz-border)]">
            {(orgs ?? []).map((org: any) => (
              <tr key={org.id} className="bg-[var(--pz-surface)] hover:bg-[var(--pz-surface-2)]">
                <td className="px-4 py-3 text-[var(--pz-text)] font-medium">{org.name}</td>
                <td className="px-4 py-3 text-[var(--pz-label)] font-mono text-xs">{org.slug}</td>
                <td className="px-4 py-3 text-[var(--pz-label)]">{new Date(org.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  {org.deleted_at
                    ? <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">Deleted</span>
                    : org.suspended
                    ? <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">Suspended</span>
                    : <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--pz-teal-bg)] text-[var(--pz-teal-ink)]">Active</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link href={`/admin/orgs/${org.id}`} className="text-xs text-[var(--pz-teal-ink)] hover:underline">View</Link>
                    <Link href={`/admin/impersonate/${org.slug}`} style={{ fontSize: 12, color: 'var(--pz-teal-ink)' }} className="hover:underline">View as owner</Link>
                    {!org.suspended && !org.deleted_at && (
                      <form action={`/api/admin/orgs/${org.id}/suspend`} method="POST">
                        <button type="submit" className="text-xs text-yellow-700 hover:underline">Suspend</button>
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
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm ${p === page ? 'bg-[var(--pz-teal)] text-[var(--pz-on-accent)]' : 'bg-[var(--pz-surface-2)] text-[var(--pz-muted)] hover:bg-[var(--pz-border)]'}`}>
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

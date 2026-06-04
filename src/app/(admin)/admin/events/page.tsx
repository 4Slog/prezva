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
    draft: 'bg-[var(--pz-surface-2)] text-[var(--pz-muted)]',
    published: 'bg-[var(--pz-teal-bg)] text-[var(--pz-teal-ink)]',
    live: 'bg-green-100 text-green-700',
    ended: 'bg-[var(--pz-surface-2)] text-[var(--pz-muted)]',
    archived: 'bg-[var(--pz-surface-2)] text-[var(--pz-muted)]',
    cancelled: 'bg-red-100 text-red-700',
  }

  const statuses = ['draft', 'published', 'live', 'ended', 'archived', 'cancelled']

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--pz-text)]">Events ({count ?? 0})</h1>
        <form method="GET" className="flex gap-2">
          <select
            name="status"
            defaultValue={status ?? ''}
            className="bg-[var(--pz-bg)] border border-[var(--pz-border)] rounded-lg px-3 py-2 text-sm text-[var(--pz-text)] focus:outline-none focus:border-[var(--pz-teal)]"
          >
            <option value="">All statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            name="search"
            defaultValue={search}
            placeholder="Search by title…"
            className="bg-[var(--pz-bg)] border border-[var(--pz-border)] rounded-lg px-3 py-2 text-sm text-[var(--pz-text)] focus:outline-none focus:border-[var(--pz-teal)] w-56"
          />
          <button type="submit" className="px-3 py-2 rounded-lg bg-[var(--pz-surface-2)] text-sm text-[var(--pz-text)] hover:bg-[var(--pz-border)]">Filter</button>
        </form>
      </div>
      <div className="rounded-xl border border-[var(--pz-border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--pz-surface-2)]">
            <tr>
              {['Title', 'Organization', 'Type', 'Status', 'Start Date', 'Registrations'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--pz-label)] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--pz-border)]">
            {(events ?? []).map((ev: any) => (
              <tr key={ev.id} className="bg-[var(--pz-surface)] hover:bg-[var(--pz-surface-2)]">
                <td className="px-4 py-3 text-[var(--pz-text)] font-medium max-w-xs truncate">{ev.title}</td>
                <td className="px-4 py-3 text-[var(--pz-label)]">
                  {ev.organizations ? (
                    <Link href={`/admin/orgs/${ev.org_id}`} className="hover:text-[var(--pz-teal-ink)]">
                      {(ev.organizations as any).name}
                    </Link>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-[var(--pz-label)] capitalize">{ev.event_type?.replace('_', ' ')}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${statusColors[ev.status] ?? 'bg-[var(--pz-surface-2)] text-[var(--pz-muted)]'}`}>
                    {ev.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--pz-label)]">{new Date(ev.start_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-[var(--pz-muted)]">{ev.registration_count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <Link key={p} href={`?page=${p}${search ? `&search=${search}` : ''}${status ? `&status=${status}` : ''}`}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm ${p === page ? 'bg-[var(--pz-teal)] text-[var(--pz-on-accent)]' : 'bg-[var(--pz-surface-2)] text-[var(--pz-muted)] hover:bg-[var(--pz-border)]'}`}>
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

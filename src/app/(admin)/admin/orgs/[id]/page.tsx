import { requireAdmin } from '@/lib/admin/gate'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function AdminOrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const admin = createAdminClient()

  const [orgResult, membersResult, eventsResult, revenueResult] = await Promise.all([
    admin.from('organizations').select('*').eq('id', id).single(),
    admin.from('org_members').select('id, role, joined_at, profiles!org_members_user_id_fkey(email, full_name)').eq('org_id', id).order('joined_at'),
    admin.from('events').select('id, title, status, start_at, registration_count').eq('org_id', id).order('start_at', { ascending: false }).limit(10),
    admin.from('registrations').select('amount_paid_cents').eq('status', 'confirmed')
      .in('event_id', (await admin.from('events').select('id').eq('org_id', id).then(r => (r.data ?? []).map(e => e.id)))),
  ])

  if (!orgResult.data) notFound()
  const org = orgResult.data as any
  const members = membersResult.data ?? []
  const events = eventsResult.data ?? []
  const revenue = (revenueResult.data ?? []).reduce((s: number, r: any) => s + (r.amount_paid_cents ?? 0), 0)

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/orgs" className="text-xs text-[var(--pz-muted)] hover:text-[var(--pz-label)]">← Organizations</Link>
          <h1 className="text-xl font-bold text-[var(--pz-text)] mt-1">{org.name}</h1>
          <p className="text-sm text-[var(--pz-label)] font-mono">{org.slug}</p>
        </div>
        <div className="flex gap-2 items-center">
          {org.deleted_at ? (
            <span className="px-3 py-1 rounded-full text-xs bg-red-100 text-red-700">Deleted</span>
          ) : org.suspended ? (
            <span className="px-3 py-1 rounded-full text-xs bg-yellow-100 text-yellow-700">Suspended</span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs bg-[var(--pz-teal-bg)] text-[var(--pz-teal-ink)]">Active</span>
          )}
          {!org.deleted_at && (
            <div className="flex gap-2">
              {!org.suspended ? (
                <form action={`/api/admin/orgs/${id}/suspend`} method="POST">
                  <button type="submit" className="px-3 py-1.5 rounded-lg bg-yellow-100 text-xs text-yellow-700 hover:bg-yellow-200">Suspend</button>
                </form>
              ) : (
                <form action={`/api/admin/orgs/${id}/unsuspend`} method="POST">
                  <button type="submit" className="px-3 py-1.5 rounded-lg bg-[var(--pz-surface-2)] text-xs text-[var(--pz-muted)] hover:bg-[var(--pz-border)]">Unsuspend</button>
                </form>
              )}
              <form action={`/api/admin/orgs/${id}/offboard`} method="POST" onSubmit={() => confirm('Permanently offboard this org? This cannot be undone.')}>
                <button type="submit" className="px-3 py-1.5 rounded-lg bg-red-100 text-xs text-red-700 hover:bg-red-200">Offboard</button>
              </form>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-[var(--pz-border)] bg-[var(--pz-surface)] p-4">
          <p className="text-xs text-[var(--pz-label)]">Total Revenue</p>
          <p className="text-xl font-bold text-[var(--pz-text)]">${(revenue / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="rounded-xl border border-[var(--pz-border)] bg-[var(--pz-surface)] p-4">
          <p className="text-xs text-[var(--pz-label)]">Events</p>
          <p className="text-xl font-bold text-[var(--pz-text)]">{events.length}</p>
        </div>
        <div className="rounded-xl border border-[var(--pz-border)] bg-[var(--pz-surface)] p-4">
          <p className="text-xs text-[var(--pz-label)]">Members</p>
          <p className="text-xl font-bold text-[var(--pz-text)]">{members.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--pz-text)]">Members</h2>
          <div className="rounded-xl border border-[var(--pz-border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--pz-surface-2)]">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-[var(--pz-label)] uppercase">Email</th>
                  <th className="px-4 py-2 text-left text-xs text-[var(--pz-label)] uppercase">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--pz-border)]">
                {members.map((m: any) => (
                  <tr key={m.id} className="bg-[var(--pz-surface)]">
                    <td className="px-4 py-2 text-[var(--pz-muted)] text-xs">{m.profiles?.email ?? '—'}</td>
                    <td className="px-4 py-2 text-[var(--pz-label)] text-xs capitalize">{m.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--pz-text)]">Recent Events</h2>
          <div className="rounded-xl border border-[var(--pz-border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--pz-surface-2)]">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-[var(--pz-label)] uppercase">Title</th>
                  <th className="px-4 py-2 text-left text-xs text-[var(--pz-label)] uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--pz-border)]">
                {events.map((ev: any) => (
                  <tr key={ev.id} className="bg-[var(--pz-surface)]">
                    <td className="px-4 py-2 text-[var(--pz-muted)] text-xs truncate max-w-[150px]">{ev.title}</td>
                    <td className="px-4 py-2 text-[var(--pz-label)] text-xs capitalize">{ev.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--pz-text)]">Details</h2>
        <div className="rounded-xl border border-[var(--pz-border)] bg-[var(--pz-surface)] p-4 text-sm space-y-2">
          <div className="flex gap-4">
            <span className="text-[var(--pz-label)] w-32">ID</span>
            <span className="text-[var(--pz-muted)] font-mono text-xs">{org.id}</span>
          </div>
          <div className="flex gap-4">
            <span className="text-[var(--pz-label)] w-32">Created</span>
            <span className="text-[var(--pz-muted)]">{new Date(org.created_at).toLocaleString()}</span>
          </div>
          {org.email && <div className="flex gap-4"><span className="text-[var(--pz-label)] w-32">Email</span><span className="text-[var(--pz-muted)]">{org.email}</span></div>}
          {org.website && <div className="flex gap-4"><span className="text-[var(--pz-label)] w-32">Website</span><span className="text-[var(--pz-muted)]">{org.website}</span></div>}
          {org.stripe_account_id && <div className="flex gap-4"><span className="text-[var(--pz-label)] w-32">Stripe</span><span className="text-[var(--pz-muted)] font-mono text-xs">{org.stripe_account_id}</span></div>}
        </div>
      </div>
    </div>
  )
}

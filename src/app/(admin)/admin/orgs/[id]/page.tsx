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
    admin.from('org_members').select('id, role, joined_at, profiles(email, full_name)').eq('org_id', id).order('joined_at'),
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
          <Link href="/admin/orgs" className="text-xs text-[#64748B] hover:text-[#94A3B8]">← Organizations</Link>
          <h1 className="text-xl font-bold text-[#F0F4F8] mt-1">{org.name}</h1>
          <p className="text-sm text-[#64748B] font-mono">{org.slug}</p>
        </div>
        <div className="flex gap-2 items-center">
          {org.deleted_at ? (
            <span className="px-3 py-1 rounded-full text-xs bg-red-900/40 text-red-400">Deleted</span>
          ) : org.suspended ? (
            <span className="px-3 py-1 rounded-full text-xs bg-yellow-900/40 text-yellow-400">Suspended</span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs bg-[#2DD4BF]/10 text-[#2DD4BF]">Active</span>
          )}
          {!org.deleted_at && (
            <div className="flex gap-2">
              {!org.suspended ? (
                <form action={`/api/admin/orgs/${id}/suspend`} method="POST">
                  <button type="submit" className="px-3 py-1.5 rounded-lg bg-yellow-900/40 text-xs text-yellow-400 hover:bg-yellow-900/60">Suspend</button>
                </form>
              ) : (
                <form action={`/api/admin/orgs/${id}/unsuspend`} method="POST">
                  <button type="submit" className="px-3 py-1.5 rounded-lg bg-[#1E3A5F] text-xs text-[#94A3B8] hover:bg-[#2A4F7A]">Unsuspend</button>
                </form>
              )}
              <form action={`/api/admin/orgs/${id}/offboard`} method="POST" onSubmit={() => confirm('Permanently offboard this org? This cannot be undone.')}>
                <button type="submit" className="px-3 py-1.5 rounded-lg bg-red-900/40 text-xs text-red-400 hover:bg-red-900/60">Offboard</button>
              </form>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-[#1E3A5F] bg-[#112240] p-4">
          <p className="text-xs text-[#64748B]">Total Revenue</p>
          <p className="text-xl font-bold text-[#F0F4F8]">${(revenue / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="rounded-xl border border-[#1E3A5F] bg-[#112240] p-4">
          <p className="text-xs text-[#64748B]">Events</p>
          <p className="text-xl font-bold text-[#F0F4F8]">{events.length}</p>
        </div>
        <div className="rounded-xl border border-[#1E3A5F] bg-[#112240] p-4">
          <p className="text-xs text-[#64748B]">Members</p>
          <p className="text-xl font-bold text-[#F0F4F8]">{members.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#F0F4F8]">Members</h2>
          <div className="rounded-xl border border-[#1E3A5F] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#071629]">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-[#64748B] uppercase">Email</th>
                  <th className="px-4 py-2 text-left text-xs text-[#64748B] uppercase">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E3A5F]">
                {members.map((m: any) => (
                  <tr key={m.id} className="bg-[#112240]">
                    <td className="px-4 py-2 text-[#94A3B8] text-xs">{m.profiles?.email ?? '—'}</td>
                    <td className="px-4 py-2 text-[#64748B] text-xs capitalize">{m.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#F0F4F8]">Recent Events</h2>
          <div className="rounded-xl border border-[#1E3A5F] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#071629]">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-[#64748B] uppercase">Title</th>
                  <th className="px-4 py-2 text-left text-xs text-[#64748B] uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E3A5F]">
                {events.map((ev: any) => (
                  <tr key={ev.id} className="bg-[#112240]">
                    <td className="px-4 py-2 text-[#94A3B8] text-xs truncate max-w-[150px]">{ev.title}</td>
                    <td className="px-4 py-2 text-[#64748B] text-xs capitalize">{ev.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-[#F0F4F8]">Details</h2>
        <div className="rounded-xl border border-[#1E3A5F] bg-[#112240] p-4 text-sm space-y-2">
          <div className="flex gap-4">
            <span className="text-[#64748B] w-32">ID</span>
            <span className="text-[#94A3B8] font-mono text-xs">{org.id}</span>
          </div>
          <div className="flex gap-4">
            <span className="text-[#64748B] w-32">Created</span>
            <span className="text-[#94A3B8]">{new Date(org.created_at).toLocaleString()}</span>
          </div>
          {org.email && <div className="flex gap-4"><span className="text-[#64748B] w-32">Email</span><span className="text-[#94A3B8]">{org.email}</span></div>}
          {org.website && <div className="flex gap-4"><span className="text-[#64748B] w-32">Website</span><span className="text-[#94A3B8]">{org.website}</span></div>}
          {org.stripe_account_id && <div className="flex gap-4"><span className="text-[#64748B] w-32">Stripe</span><span className="text-[#94A3B8] font-mono text-xs">{org.stripe_account_id}</span></div>}
        </div>
      </div>
    </div>
  )
}

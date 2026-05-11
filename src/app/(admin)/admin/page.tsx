import { requireAdmin } from '@/lib/admin/gate'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

export default async function AdminOverviewPage() {
  await requireAdmin()
  const admin = createAdminClient()

  const [orgsResult, eventsResult, regsResult] = await Promise.all([
    admin.from('organizations').select('id', { count: 'exact', head: true }),
    admin.from('events').select('id', { count: 'exact', head: true }),
    admin.from('registrations').select('amount_paid_cents').eq('status', 'confirmed'),
  ])

  const totalOrgs = orgsResult.count ?? 0
  const totalEvents = eventsResult.count ?? 0
  const grossRevenue = (regsResult.data ?? []).reduce((sum, r) => sum + (r.amount_paid_cents ?? 0), 0)

  const stats = [
    { label: 'Organizations', value: totalOrgs.toLocaleString(), href: '/admin/orgs' },
    { label: 'Total Events', value: totalEvents.toLocaleString(), href: '/admin/events' },
    { label: 'Gross Revenue', value: `$${(grossRevenue / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, href: '/admin/revenue' },
  ]

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F4F8]">Platform Overview</h1>
        <p className="text-sm text-[#64748B] mt-1">Internal admin dashboard — restricted access</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {stats.map(s => (
          <Link key={s.label} href={s.href} className="rounded-xl border border-[#1E3A5F] bg-[#112240] p-5 hover:border-[#00BFA6]/40 transition-colors">
            <p className="text-xs text-[#64748B] mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-[#F0F4F8]">{s.value}</p>
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Link href="/admin/audit" className="rounded-xl border border-[#1E3A5F] bg-[#112240] p-5 hover:border-[#00BFA6]/40 transition-colors">
          <p className="text-sm font-semibold text-[#F0F4F8]">Audit Log</p>
          <p className="text-xs text-[#64748B] mt-1">View all system events</p>
        </Link>
        <Link href="/admin/orgs" className="rounded-xl border border-[#1E3A5F] bg-[#112240] p-5 hover:border-[#00BFA6]/40 transition-colors">
          <p className="text-sm font-semibold text-[#F0F4F8]">Manage Organizations</p>
          <p className="text-xs text-[#64748B] mt-1">Suspend, unsuspend, offboard</p>
        </Link>
      </div>
    </div>
  )
}

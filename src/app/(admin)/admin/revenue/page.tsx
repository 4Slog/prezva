import { requireAdmin } from '@/lib/admin/gate'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function AdminRevenuePage() {
  await requireAdmin()
  const admin = createAdminClient()

  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const sixtyDaysAgo = new Date(now)
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

  const [allRegsResult, recentRegsResult, prevRegsResult, topOrgsResult] = await Promise.all([
    admin
      .from('registrations')
      .select('amount_paid_cents, created_at')
      .eq('status', 'confirmed'),
    admin
      .from('registrations')
      .select('amount_paid_cents')
      .eq('status', 'confirmed')
      .gte('created_at', thirtyDaysAgo.toISOString()),
    admin
      .from('registrations')
      .select('amount_paid_cents')
      .eq('status', 'confirmed')
      .gte('created_at', sixtyDaysAgo.toISOString())
      .lt('created_at', thirtyDaysAgo.toISOString()),
    admin
      .from('registrations')
      .select('amount_paid_cents, events(org_id, organizations(name))')
      .eq('status', 'confirmed'),
  ])

  const allRegs = allRegsResult.data ?? []
  const grossRevenue = allRegs.reduce((s, r) => s + (r.amount_paid_cents ?? 0), 0)
  const mrr = (recentRegsResult.data ?? []).reduce((s, r) => s + (r.amount_paid_cents ?? 0), 0)
  const prevMrr = (prevRegsResult.data ?? []).reduce((s, r) => s + (r.amount_paid_cents ?? 0), 0)
  const mrrChange = prevMrr > 0 ? ((mrr - prevMrr) / prevMrr) * 100 : 0

  // Monthly breakdown (last 6 months)
  const monthlyMap: Record<string, number> = {}
  for (const r of allRegs) {
    const d = new Date(r.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap[key] = (monthlyMap[key] ?? 0) + (r.amount_paid_cents ?? 0)
  }
  const months = Object.entries(monthlyMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 6)
    .reverse()

  // Top orgs by revenue
  const orgRevMap: Record<string, { name: string; total: number }> = {}
  for (const r of (topOrgsResult.data ?? [])) {
    const ev = (r as any).events
    if (!ev) continue
    const org = ev.organizations
    if (!org) continue
    const orgId = ev.org_id
    if (!orgRevMap[orgId]) orgRevMap[orgId] = { name: org.name, total: 0 }
    orgRevMap[orgId].total += r.amount_paid_cents ?? 0
  }
  const topOrgs = Object.values(orgRevMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

  const stats = [
    { label: 'Gross Revenue (all time)', value: fmt(grossRevenue) },
    { label: 'Revenue (last 30 days)', value: fmt(mrr) },
    { label: '30-day Change', value: `${mrrChange >= 0 ? '+' : ''}${mrrChange.toFixed(1)}%`, positive: mrrChange >= 0 },
  ]

  return (
    <div className="space-y-8 max-w-5xl">
      <h1 className="text-xl font-bold text-[var(--pz-text)]">Revenue</h1>
      <div className="grid grid-cols-3 gap-4">
        {stats.map(s => (
          <div key={s.label} className="rounded-xl border border-[var(--pz-border)] bg-[var(--pz-surface)] p-5">
            <p className="text-xs text-[var(--pz-label)] mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${'positive' in s ? (s.positive ? 'text-[var(--pz-teal-ink)]' : 'text-[var(--pz-error)]') : 'text-[var(--pz-text)]'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--pz-text)]">Monthly Revenue (last 6 months)</h2>
          <div className="rounded-xl border border-[var(--pz-border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--pz-surface-2)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--pz-label)] uppercase">Month</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--pz-label)] uppercase">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--pz-border)]">
                {months.map(([month, cents]) => (
                  <tr key={month} className="bg-[var(--pz-surface)]">
                    <td className="px-4 py-3 text-[var(--pz-muted)]">{month}</td>
                    <td className="px-4 py-3 text-right text-[var(--pz-text)]">{fmt(cents)}</td>
                  </tr>
                ))}
                {months.length === 0 && (
                  <tr className="bg-[var(--pz-surface)]">
                    <td colSpan={2} className="px-4 py-6 text-center text-[var(--pz-label)]">No revenue data</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--pz-text)]">Top Organizations by Revenue</h2>
          <div className="rounded-xl border border-[var(--pz-border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--pz-surface-2)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--pz-label)] uppercase">Organization</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--pz-label)] uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--pz-border)]">
                {topOrgs.map((org, i) => (
                  <tr key={i} className="bg-[var(--pz-surface)]">
                    <td className="px-4 py-3 text-[var(--pz-muted)]">{org.name}</td>
                    <td className="px-4 py-3 text-right text-[var(--pz-text)]">{fmt(org.total)}</td>
                  </tr>
                ))}
                {topOrgs.length === 0 && (
                  <tr className="bg-[var(--pz-surface)]">
                    <td colSpan={2} className="px-4 py-6 text-center text-[var(--pz-label)]">No data</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

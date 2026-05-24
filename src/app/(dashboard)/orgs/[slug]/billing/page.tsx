import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

type Props = { params: Promise<{ slug: string }> }

export default async function BillingPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug, stripe_account_id, stripe_customer_id, charges_enabled, payouts_enabled, org_members!inner(user_id, role)')
    .eq('slug', slug)
    .eq('org_members.user_id', user.id)
    .maybeSingle()

  if (!org) redirect('/dashboard')

  const myRole = (org.org_members as { role: string }[])[0]?.role ?? 'staff'
  if (!['owner', 'admin'].includes(myRole)) redirect(`/orgs/${slug}/settings`)

  const hasStripe = !!org.stripe_account_id
  const fullyEnabled = org.charges_enabled && org.payouts_enabled

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6">
        <Link href={`/orgs/${slug}/settings`} className="text-xs text-[#64748B] hover:text-[#94A3B8]">
          ← Back to settings
        </Link>
      </div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#F0F4F8]">Billing</h1>
        <p className="text-sm text-[#94A3B8]">{org.name}</p>
      </div>

      {/* Stripe Connect Status */}
      <section className="mb-8 rounded-xl border border-[#1E3A5F] bg-[#112240] p-6">
        <h2 className="text-base font-semibold text-[#F0F4F8] mb-4">Stripe Connect</h2>
        {!hasStripe ? (
          <div className="rounded-lg px-4 py-3" style={{ background: '#EF444422', border: '1px solid #EF4444' }}>
            <p className="text-sm font-medium text-red-400 mb-2">Not connected</p>
            <p className="text-xs text-[#94A3B8] mb-3">Connect your Stripe account to accept ticket payments.</p>
            <a href={`/api/stripe/connect/onboard?org_id=${org.id}`}
              className="inline-block px-4 py-2 rounded-lg text-sm font-bold text-[#0D1B2A]"
              style={{ background: '#00BFA6' }}>
              Connect Stripe
            </a>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: fullyEnabled ? '#22C55E' : '#F59E0B', display: 'inline-block' }} />
              <span className="text-sm font-medium text-[#F0F4F8]">
                {fullyEnabled ? 'Fully active' : 'Setup incomplete'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border border-[#1E3A5F] p-3">
                <p className="text-xs text-[#64748B] mb-1">Accept card payments</p>
                <p className="text-sm font-semibold" style={{ color: org.charges_enabled ? '#22C55E' : '#F59E0B' }}>
                  {org.charges_enabled ? '✓ Enabled' : '⚠ Not enabled'}
                </p>
              </div>
              <div className="rounded-lg border border-[#1E3A5F] p-3">
                <p className="text-xs text-[#64748B] mb-1">Receive payouts</p>
                <p className="text-sm font-semibold" style={{ color: org.payouts_enabled ? '#22C55E' : '#F59E0B' }}>
                  {org.payouts_enabled ? '✓ Enabled' : '⚠ Not enabled'}
                </p>
              </div>
            </div>
            {!fullyEnabled && (
              <div className="rounded-lg px-4 py-3 mb-4" style={{ background: '#F59E0B22', border: '1px solid #F59E0B' }}>
                <p className="text-sm text-[#F59E0B]">
                  ⚠ Your Stripe setup is incomplete.{' '}
                  <a href={`/api/stripe/connect/onboard?org_id=${org.id}`} className="underline">
                    Complete Stripe setup
                  </a>
                </p>
              </div>
            )}
            <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer"
              className="text-sm text-[#00BFA6] hover:underline">
              Open Stripe dashboard ↗
            </a>
          </>
        )}
      </section>

      {/* Prezva Plan */}
      <section className="rounded-xl border border-[#1E3A5F] bg-[#112240] p-6">
        <h2 className="text-base font-semibold text-[#F0F4F8] mb-1">Prezva Plan</h2>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-2xl font-bold text-[#F0F4F8]">$199</span>
          <span className="text-sm text-[#64748B]">/mo</span>
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#00BFA6]/10 text-[#00BFA6]">Professional</span>
        </div>
        <ul className="text-sm text-[#94A3B8] space-y-1 mb-4">
          <li>Unlimited events</li>
          <li>All features</li>
          <li>Direct payouts</li>
          <li>0% ticket fees</li>
        </ul>
        <p className="text-xs text-[#64748B]">
          Need help? Contact{' '}
          <a href="mailto:billing@prezva.app" className="text-[#00BFA6] hover:underline">billing@prezva.app</a>
        </p>
      </section>
    </div>
  )
}

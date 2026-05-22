import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPendingInvites } from '@/lib/orgs/actions'
import { InviteForm } from '@/components/orgs/InviteForm'
import { MemberList } from '@/components/orgs/MemberList'
import { ConnectBankButton } from '@/components/connect/ConnectBankButton'
import { getConnectStatus } from '@/lib/connect/actions'
import { OrgSettingsForm } from './OrgSettingsForm'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ connect?: string }>
}

export default async function OrgSettingsPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { connect } = await searchParams
  const user = await requireUser()
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('*, org_members!inner(user_id, role)')
    .eq('slug', slug)
    .eq('org_members.user_id', user.id)
    .maybeSingle()

  if (!org) redirect('/dashboard')

  const myRole = (org.org_members as { role: string }[])[0]?.role ?? 'staff'
  const canManage = ['owner', 'admin'].includes(myRole)
  const isOwner = myRole === 'owner'

  // Admin client: fetch members bypassing RLS so owner always sees the full list
  const admin = createAdminClient()
  const { data: members } = await admin
    .from('org_members')
    .select('id, role, created_at, profiles(id, full_name, email, avatar_url, job_title)')
    .eq('org_id', org.id)
    .order('created_at', { ascending: true })

  // Fetch pending invites from legacy table and new org_invites table
  const [legacyInvitesResult, newPendingInvites] = await Promise.all([
    admin
      .from("org_member_invites")
      .select("id, email, role, created_at, expires_at, accepted_at")
      .eq("org_id", org.id)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    canManage ? getPendingInvites(org.id).catch(() => []) : Promise.resolve([]),
  ])
  const legacyInvites = legacyInvitesResult.data ?? []
  // Merge: org_invites (with token/resend support) take priority; skip legacy dupes
  const legacyEmails = new Set(newPendingInvites.map(i => i.email.toLowerCase()))
  const pendingInvites = [
    ...newPendingInvites,
    ...legacyInvites.filter(i => !legacyEmails.has(i.email.toLowerCase())),
  ]

  // Fetch Connect status server-side for initial render
  const connectStatus = isOwner ? await getConnectStatus(org.id) : null

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#F0F4F8]">{org.name}</h1>
        <p className="text-sm text-[#94A3B8]">Organization settings</p>
      </div>

      {/* Connect status banner */}
      {connect === 'success' && (
        <div className="mb-6 rounded-lg bg-[#22C55E]/10 border border-[#22C55E]/30 px-4 py-3">
          <p className="text-sm font-medium text-[#22C55E]">
            ✅ Bank account connected — ticket payments will go directly to your account.
          </p>
        </div>
      )}
      {connect === 'incomplete' && (
        <div className="mb-6 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/30 px-4 py-3">
          <p className="text-sm font-medium text-[#F59E0B]">
            ⚠️ Stripe setup incomplete — finish connecting your bank account to accept payments.
          </p>
        </div>
      )}

      {/* Stripe Connect — owners only */}
      {isOwner && connectStatus && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-[#F0F4F8] mb-3">Payments</h2>
          <ConnectBankButton
            orgId={org.id}
            orgSlug={org.slug}
            initialStatus={connectStatus as Parameters<typeof ConnectBankButton>[0]['initialStatus']}
          />
        </section>
      )}

      {/* General settings */}
      {canManage && (
        <section className="mb-8 rounded-xl border border-[#1E3A5F] bg-[#112240] p-6">
          <h2 className="text-base font-semibold text-[#F0F4F8] mb-4">General</h2>
          <OrgSettingsForm org={org as Parameters<typeof OrgSettingsForm>[0]['org']} />
        </section>
      )}

      {/* Member list */}
      <section className="mb-6">
        <MemberList
          members={(members ?? []) as unknown as Parameters<typeof MemberList>[0]['members']}
          orgId={org.id}
          currentUserId={user.id}
          currentUserRole={myRole}
        />
      </section>

      {canManage && <InviteForm orgId={org.id} />}
    </div>
  )
}

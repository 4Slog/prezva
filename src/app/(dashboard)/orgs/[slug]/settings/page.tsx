import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgPermissions } from '@/lib/auth/assert-permission'
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
  const isOwner = myRole === 'owner'

  // Derive access from the actual permission set, not the role enum.
  const permSet = await getOrgPermissions(org.id, user.id)
  const canRolesManage = permSet.has('*') || permSet.has('org.roles.manage')
  const canOrgSettings = permSet.has('*') || permSet.has('org.settings')
  const canInvite      = permSet.has('*') || permSet.has('org.members.invite')
  const canViewMembers = permSet.has('*') || permSet.has('org.members.view')
  const permissions    = Array.from(permSet)

  // Admin client: fetch members bypassing RLS so owner always sees the full list
  const admin = createAdminClient()
  const { data: members } = await admin
    .from('org_members')
    .select('id, role, role_id, created_at, profiles(id, full_name, email, avatar_url, job_title)')
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
    canInvite ? getPendingInvites(org.id).catch(() => []) : Promise.resolve([]),
  ])
  const legacyInvites = legacyInvitesResult.data ?? []
  // Merge: org_invites (with token/resend support) take priority; skip legacy dupes
  const legacyEmails = new Set(newPendingInvites.map(i => i.email.toLowerCase()))
  const pendingInvites = [
    ...newPendingInvites,
    ...legacyInvites.filter(i => !legacyEmails.has(i.email.toLowerCase())),
  ]

  // Fetch all roles (builtin + custom) for the member role dropdown
  const { data: allRolesRaw } = canRolesManage
    ? await admin
        .from('roles')
        .select('id, name, slug, is_builtin')
        .eq('org_id', org.id)
        .order('name')
    : { data: null }

  const BUILTIN_ORDER = ['owner', 'admin', 'staff']
  const allRoles = (allRolesRaw ?? []).sort((a, b) => {
    const ai = BUILTIN_ORDER.indexOf(a.slug)
    const bi = BUILTIN_ORDER.indexOf(b.slug)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.name.localeCompare(b.name)
  })

  // Fetch Connect status server-side for initial render
  const connectStatus = isOwner ? await getConnectStatus(org.id) : null

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--pz-text)]">{org.name}</h1>
        <p className="text-sm text-[var(--pz-muted)]">Organization settings</p>
        <div className="flex gap-4 mt-3">
          <span className="text-sm font-semibold text-[var(--pz-text)] border-b-2 border-[var(--pz-teal)] pb-1">Settings</span>
          {canRolesManage && (
            <a href={`/orgs/${org.slug}/settings/roles`} className="text-sm text-[var(--pz-muted)] hover:text-[var(--pz-text)] pb-1 transition-colors">Roles</a>
          )}
          <a href={`/orgs/${org.slug}/billing`} className="text-sm text-[var(--pz-muted)] hover:text-[var(--pz-text)] pb-1 transition-colors">Billing</a>
        </div>
      </div>

      {/* Connect status banner */}
      {connect === 'success' && (
        <div className="mb-6 rounded-lg bg-[var(--pz-success-fill)]/10 border border-[var(--pz-success-fill)]/30 px-4 py-3">
          <p className="text-sm font-medium text-[var(--pz-success-fill)]">
            ✅ Bank account connected — ticket payments will go directly to your account.
          </p>
        </div>
      )}
      {connect === 'incomplete' && (
        <div className="mb-6 rounded-lg bg-[var(--pz-warning-fill)]/10 border border-[var(--pz-warning-fill)]/30 px-4 py-3">
          <p className="text-sm font-medium text-[var(--pz-warning-fill)]">
            ⚠️ Stripe setup incomplete — finish connecting your bank account to accept payments.
          </p>
        </div>
      )}

      {/* Stripe Connect — owners only */}
      {isOwner && connectStatus && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--pz-text)] mb-3">Payments</h2>
          <ConnectBankButton
            orgId={org.id}
            orgSlug={org.slug}
            initialStatus={connectStatus as Parameters<typeof ConnectBankButton>[0]['initialStatus']}
          />
        </section>
      )}

      {/* General settings */}
      {canOrgSettings && (
        <section className="mb-8 rounded-xl border border-[var(--pz-border)] bg-[var(--pz-surface)] p-6">
          <h2 className="text-base font-semibold text-[var(--pz-text)] mb-4">General</h2>
          <OrgSettingsForm org={org as Parameters<typeof OrgSettingsForm>[0]['org']} />
        </section>
      )}

      {/* Member list — visible to members with org.members.view */}
      {canViewMembers && (
        <section className="mb-6">
          <MemberList
            members={(members ?? []) as unknown as Parameters<typeof MemberList>[0]['members']}
            pendingInvites={pendingInvites as unknown as Parameters<typeof MemberList>[0]['pendingInvites']}
            allRoles={allRoles as Parameters<typeof MemberList>[0]['allRoles']}
            orgId={org.id}
            currentUserId={user.id}
            currentUserRole={myRole}
          />
        </section>
      )}

      {canInvite && <InviteForm orgId={org.id} />}

      {/* Danger zone — owners only */}
      {isOwner && (
        <section className="mb-8 rounded-xl p-6 mt-2" style={{ border: '2px solid var(--pz-error)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-error)', margin: '0 0 8px' }}>
            Danger Zone
          </h2>
          <p style={{ fontSize: 13, color: 'var(--pz-muted)', margin: '0 0 16px' }}>
            These actions are irreversible. Please be certain.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.875rem 0', borderBottom: '1px solid var(--pz-border)' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--pz-text)', margin: 0 }}>
                Transfer ownership
              </p>
              <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: 0 }}>
                Transfer this organization to another member
              </p>
            </div>
            <button style={{ padding: '0.5rem 1rem', borderRadius: 8, fontSize: 13,
                             border: '1px solid var(--pz-error)', background: 'transparent',
                             color: 'var(--pz-error)', cursor: 'pointer', fontWeight: 600 }}>
              Transfer
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

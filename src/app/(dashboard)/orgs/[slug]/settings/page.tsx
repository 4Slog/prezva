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
        <div className="flex gap-4 mt-3">
          <span className="text-sm font-semibold text-[#F0F4F8] border-b-2 border-[#2DD4BF] pb-1">Settings</span>
          <a href={`/orgs/${org.slug}/billing`} className="text-sm text-[#64748B] hover:text-[#94A3B8] pb-1">Billing</a>
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

      {/* Role permission matrix */}
      <section className="mb-8 rounded-xl border border-[#1E3A5F] bg-[#112240] p-6 mt-6">
        <h2 className="text-base font-semibold text-[#F0F4F8] mb-4">Role Permissions</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: '#94A3B8', fontWeight: 600 }}>Action</th>
              {['Owner', 'Admin', 'Staff'].map(role => (
                <th key={role} style={{ textAlign: 'center', padding: '8px 12px', color: '#94A3B8', fontWeight: 600 }}>{role}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { action: 'Create / edit events',      owner: true,  admin: true,  staff: false },
              { action: 'Manage tickets & pricing',  owner: true,  admin: true,  staff: false },
              { action: 'View analytics & revenue',  owner: true,  admin: true,  staff: false },
              { action: 'Issue refunds',             owner: true,  admin: true,  staff: false },
              { action: 'Check-in attendees',        owner: true,  admin: true,  staff: true  },
              { action: 'Add / edit attendees',      owner: true,  admin: true,  staff: true  },
              { action: 'Send announcements',        owner: true,  admin: true,  staff: false },
              { action: 'Manage speakers',           owner: true,  admin: true,  staff: true  },
              { action: 'Manage volunteers',         owner: true,  admin: true,  staff: true  },
              { action: 'Manage integrations',       owner: true,  admin: true,  staff: false },
              { action: 'Invite team members',       owner: true,  admin: true,  staff: false },
              { action: 'Organization settings',     owner: true,  admin: false, staff: false },
              { action: 'Delete organization',       owner: true,  admin: false, staff: false },
            ].map(({ action, owner, admin, staff }) => (
              <tr key={action} style={{ borderTop: '1px solid #1E3A5F' }}>
                <td style={{ padding: '8px 12px', color: '#F0F4F8' }}>{action}</td>
                {[owner, admin, staff].map((allowed, i) => (
                  <td key={i} style={{ textAlign: 'center', padding: '8px 12px' }}>
                    {allowed
                      ? <span style={{ color: '#2DD4BF', fontSize: 16 }}>✓</span>
                      : <span style={{ color: '#1E3A5F', fontSize: 16 }}>—</span>
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Danger zone — owners only */}
      {isOwner && (
        <section className="mb-8 rounded-xl p-6 mt-2" style={{ border: '2px solid var(--pz-error)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-error)', margin: '0 0 8px' }}>
            Danger Zone
          </h2>
          <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 16px' }}>
            These actions are irreversible. Please be certain.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.875rem 0', borderBottom: '1px solid #1E3A5F' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: 14, color: '#F0F4F8', margin: 0 }}>
                Transfer ownership
              </p>
              <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
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

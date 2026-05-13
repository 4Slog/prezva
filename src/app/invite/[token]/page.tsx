import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { acceptInvite } from '@/lib/orgs/actions'
import { redirect } from 'next/navigation'

type Props = { params: Promise<{ token: string }> }

export default async function InvitePage({ params }: Props) {
  const { token } = await params

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: invite } = await service
    .from('org_member_invites')
    .select('email, role, accepted_at, expires_at, organizations(name)')
    .eq('token', token)
    .maybeSingle()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const expired = invite && new Date(invite.expires_at) < new Date()
  const used = invite?.accepted_at != null
  const orgName = (invite as any)?.organizations?.name ?? 'an organization'

  if (!invite || expired || used) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--pz-bg)' }}>
        <div className="pz-card p-8 text-center max-w-sm w-full">
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--pz-text)' }}>
            {!invite ? 'Invite not found' : used ? 'Already accepted' : 'Invite expired'}
          </h1>
          <p className="text-sm" style={{ color: 'var(--pz-text-muted)' }}>
            {!invite ? 'This link is invalid or has been removed.' : used ? 'This invitation was already accepted.' : 'This invitation link has expired. Ask an admin to resend it.'}
          </p>
        </div>
      </div>
    )
  }

  if (!user) {
    redirect(`/auth/login?next=/invite/${token}`)
  }

  async function accept() {
    'use server'
    const result = await acceptInvite(token)
    if ('error' in result && result.error) return
    // Redirect to the specific org so multi-org users land in the right place
    if ('orgId' in result && result.orgId) {
      const service2 = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const { data: org } = await service2
        .from('organizations')
        .select('slug')
        .eq('id', result.orgId)
        .single()
      if (org?.slug) redirect(`/orgs/${org.slug}/settings`)
    }
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-10 px-4" style={{ background: 'var(--pz-bg)' }}>
      <div className="pz-card p-8 text-center max-w-sm w-full">
        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--pz-text)' }}>You&apos;re invited!</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--pz-text-muted)' }}>
          Join <strong style={{ color: 'var(--pz-text)' }}>{orgName}</strong> as{' '}
          <strong style={{ color: 'var(--pz-text)' }}>{invite.role}</strong>.
        </p>
        <form action={accept}>
          <button
            type="submit"
            className="w-full py-2 rounded-lg font-semibold text-sm"
            style={{ background: 'var(--pz-teal)', color: '#fff' }}
          >
            Accept Invitation
          </button>
        </form>
        <p className="text-xs mt-4" style={{ color: 'var(--pz-text-muted)' }}>
          Signed in as <strong>{user.email}</strong>
          {user.email?.toLowerCase() !== invite.email.toLowerCase() && (
            <span style={{ color: '#f87171' }}> — this invite was sent to {invite.email}</span>
          )}
        </p>
      </div>
    </div>
  )
}

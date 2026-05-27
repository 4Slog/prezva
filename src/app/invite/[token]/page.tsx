import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { acceptInvite } from '@/lib/orgs/actions'
import { redirect } from 'next/navigation'
import Link from 'next/link'

type Props = { params: Promise<{ token: string }> }

export default async function InvitePage({ params }: Props) {
  const { token } = await params

  // Admin client: invite lookup by token is intentionally pre-auth — the token
  // is the capability that lets a user accept the invite.
  const service = createAdminClient()

  const { data: invite } = await service
    .from('org_member_invites')
    .select('email, role, accepted_at, expires_at, organizations(name)')
    .eq('token', token)
    .maybeSingle()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const expired = invite && new Date(invite.expires_at) < new Date()
  const used = invite?.accepted_at != null
  const orgName = (invite as { organizations?: { name?: string } } | null)?.organizations?.name ?? 'an organization'

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
    // Preserve invite context so post-login lands back here, then accept.
    const next = encodeURIComponent(`/invite/${token}`)
    return (
      <div className="min-h-screen flex items-center justify-center py-10 px-4" style={{ background: 'var(--pz-bg)' }}>
        <div className="pz-card p-8 text-center max-w-sm w-full">
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--pz-text)' }}>You&apos;re invited!</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--pz-text-muted)' }}>
            Join <strong style={{ color: 'var(--pz-text)' }}>{orgName}</strong> as{' '}
            <strong style={{ color: 'var(--pz-text)' }}>{invite.role}</strong>.
          </p>
          <p className="text-xs mb-6" style={{ color: 'var(--pz-text-muted)' }}>
            Sign in (or create an account) with <strong>{invite.email}</strong> to accept.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href={`/login?next=${next}`}
              className="w-full py-2 rounded-lg font-semibold text-sm"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A', textDecoration: 'none', display: 'inline-block' }}
            >
              Sign in to accept
            </Link>
            <Link
              href={`/signup?next=${next}`}
              className="w-full py-2 rounded-lg font-semibold text-sm"
              style={{ background: 'transparent', color: 'var(--pz-text)', border: '1px solid var(--pz-border)', textDecoration: 'none', display: 'inline-block' }}
            >
              Create an account
            </Link>
          </div>
        </div>
      </div>
    )
  }

  async function accept() {
    'use server'
    const result = await acceptInvite(token)
    if ('error' in result && result.error) return
    const params = new URLSearchParams({ joined: orgName, role: String(invite!.role) })
    redirect(`/dashboard?${params.toString()}`)
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

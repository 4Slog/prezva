import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { inviteStaffMember, getStaffList, revokeStaffInvite } from '@/lib/checkin/sprint7-actions'
import { revalidatePath } from 'next/cache'

type Props = { params: Promise<{ slug: string }> }

export default async function StaffPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events').select('id, title, org_id').eq('slug', slug).single()
  if (!event) notFound()

  const { data: member } = await supabase
    .from('org_members').select('role')
    .eq('org_id', (event as any).org_id).eq('user_id', user.id).single()
  if (!member) notFound()

  const staff = await getStaffList((event as any).id)

  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none'
  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <p className="text-xs mb-1" style={{ color: 'var(--pz-muted)' }}>
          <a href={`/events/${slug}`} style={{ color: 'var(--pz-muted)' }}>← {(event as any).title}</a>
        </p>
        <h1 className="text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Staff & Volunteers</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--pz-muted)' }}>
          Invite team members who can perform check-in but don&apos;t have full organizer access.
        </p>
      </div>

      {/* Invite form */}
      <div className="pz-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--pz-text)' }}>Invite staff member</h2>
        <form
          action={async (fd: FormData) => {
            'use server'
            const email = fd.get('email') as string
            const eventId = fd.get('event_id') as string
            await inviteStaffMember(eventId, email)
            revalidatePath(`/events/${slug}/staff`)
          }}
          className="flex gap-2"
        >
          <input type="hidden" name="event_id" value={(event as any).id} />
          <input
            name="email"
            type="email"
            required
            placeholder="volunteer@example.com"
            className={inputCls + ' flex-1'}
            style={inputStyle}
          />
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm font-semibold shrink-0"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            Invite
          </button>
        </form>
        <p className="text-xs mt-2" style={{ color: 'var(--pz-muted)' }}>
          Staff members can access check-in only. Copy their invite link below to share.
        </p>
      </div>

      {/* Staff list */}
      {staff.length === 0 ? (
        <div className="pz-card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>No staff invited yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {staff.map((s: any) => (
            <div key={s.id} className="pz-card p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--pz-text)' }}>{s.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs capitalize"
                      style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}
                    >
                      {s.role}
                    </span>
                    {s.accepted_at ? (
                      <span className="text-xs" style={{ color: 'var(--pz-success)' }}>
                        Accepted {new Date(s.accepted_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--pz-muted)' }}>
                        Pending — Token: <code className="font-mono">{s.token?.slice(0, 12)}…</code>
                      </span>
                    )}
                  </div>
                </div>
                <form
                  action={async () => {
                    'use server'
                    await revokeStaffInvite(s.id)
                    revalidatePath(`/events/${slug}/staff`)
                  }}
                >
                  <button type="submit" className="text-xs hover:opacity-70" style={{ color: 'var(--pz-error)' }}>
                    Revoke
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

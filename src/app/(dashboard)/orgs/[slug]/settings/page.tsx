import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { InviteForm } from '@/components/orgs/InviteForm'
import { MemberList } from '@/components/orgs/MemberList'
import { updateOrg } from '@/lib/orgs/actions'

type Props = { params: Promise<{ slug: string }> }

export default async function OrgSettingsPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  // Fetch org + caller membership
  const { data: org } = await supabase
    .from('organizations')
    .select('*, org_members!inner(user_id, role, accepted_at)')
    .eq('slug', slug)
    .eq('org_members.user_id', user.id)
    .maybeSingle()

  if (!org) redirect('/dashboard')

  const myRole = (org.org_members as { role: string }[])[0]?.role ?? 'staff'
  const canManage = ['owner', 'admin'].includes(myRole)

  // Fetch all members
  const { data: members } = await supabase
    .from('org_members')
    .select('id, role, accepted_at, created_at, profiles(id, full_name, email, avatar_url, job_title)')
    .eq('org_id', org.id)
    .order('created_at', { ascending: true })

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
        <p className="text-sm text-gray-500">Organization settings</p>
      </div>

      {/* General settings */}
      {canManage && (
        <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">General</h2>
          <form
            action={async (fd: FormData) => {
              'use server'
              await updateOrg(org.id, fd)
            }}
            className="flex flex-col gap-4"
          >
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input
                name="name"
                defaultValue={org.name}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Timezone</label>
              <select
                name="timezone"
                defaultValue={org.timezone}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="America/New_York">Eastern (ET)</option>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Los_Angeles">Pacific (PT)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <button
              type="submit"
              className="self-start rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Save changes
            </button>
          </form>
        </section>
      )}

      {/* Member list */}
      <section className="mb-6">
        <MemberList
          members={(members ?? []) as unknown as Parameters<typeof MemberList>[0]["members"]}
          orgId={org.id}
          currentUserId={user.id}
          currentUserRole={myRole}
        />
      </section>

      {/* Invite */}
      {canManage && <InviteForm orgId={org.id} />}
    </div>
  )
}

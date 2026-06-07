import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgPermissions } from '@/lib/auth/assert-permission'
import { RolesManager } from '@/components/orgs/RolesManager'
import { PERMISSION_LABELS } from '@/lib/auth/permission-labels'

const PERMISSION_CATEGORIES: { label: string; keys: string[] }[] = [
  { label: 'Organization', keys: [
    'org.settings', 'org.branding', 'org.billing',
    'org.members.view', 'org.members.manage', 'org.members.invite',
    'org.roles.view', 'org.roles.manage', 'org.delete',
    'org.templates.view', 'org.templates.manage',
    'org.speaker_library.view', 'org.speaker_library.manage',
    'org.integrations', 'org.certificate_templates', 'org.audit_log',
  ]},
  { label: 'Event Core', keys: [
    'event.manage', 'event.tickets',
    'attendees.view', 'attendees.edit', 'attendees.refund',
    'checkin.manage', 'checkin.undo',
    'agenda.view', 'agenda.manage',
    'speakers.view', 'speakers.manage',
    'volunteers.manage', 'badges.manage',
  ]},
  { label: 'Engagement', keys: [
    'announcements.manage', 'announcements.send',
    'surveys.view', 'surveys.manage',
    'networking.view', 'networking.manage',
    'community.manage', 'photos.manage',
    'leaderboard.view', 'leaderboard.manage',
    'icebreakers.manage', 'trivia.manage', 'passport.manage',
    'qa.view', 'qa.moderate',
  ]},
  { label: 'Advanced', keys: [
    'sponsors.view', 'sponsors.manage',
    'certificates.manage',
    'analytics.view', 'analytics.manage',
    'event.audit_log', 'failed_jobs.manage',
    'run_of_show.view', 'run_of_show.manage',
    'event.integrations', 'video.view', 'video.manage',
  ]},
]

type Props = {
  params: Promise<{ slug: string }>
}

export default async function RolesPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug, org_members!inner(user_id, role)')
    .eq('slug', slug)
    .eq('org_members.user_id', user.id)
    .maybeSingle()

  if (!org) redirect('/dashboard')

  // Gate on the actual permission, not the role enum, so custom roles with
  // org.roles.manage can reach this page and built-in admins without it cannot.
  const actorPermSet = await getOrgPermissions(org.id, user.id)
  if (!actorPermSet.has('*') && !actorPermSet.has('org.roles.manage')) {
    redirect(`/orgs/${slug}/settings`)
  }

  const admin = createAdminClient()

  // Fetch ALL roles (builtin + custom) with their permissions
  const { data: rolesRaw } = await admin
    .from('roles')
    .select('id, name, slug, is_builtin, role_permissions(permission_key)')
    .eq('org_id', org.id)
    .order('name')

  const BUILTIN_ORDER = ['owner', 'admin', 'staff']
  const roles = (rolesRaw ?? [])
    .map(r => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      is_builtin: r.is_builtin ?? false,
      permissionKeys: (r.role_permissions as { permission_key: string }[]).map(p => p.permission_key),
    }))
    .sort((a, b) => {
      const ai = BUILTIN_ORDER.indexOf(a.slug)
      const bi = BUILTIN_ORDER.indexOf(b.slug)
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return a.name.localeCompare(b.name)
    })

  const actorHeldKeys = [...actorPermSet]

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--pz-text)]">{org.name}</h1>
        <p className="text-sm text-[var(--pz-muted)]">Organization settings</p>
        <div className="flex gap-4 mt-3">
          <a
            href={`/orgs/${slug}/settings`}
            className="text-sm text-[var(--pz-muted)] hover:text-[var(--pz-text)] pb-1 transition-colors"
          >
            Settings
          </a>
          <span className="text-sm font-semibold text-[var(--pz-text)] border-b-2 border-[var(--pz-teal)] pb-1">
            Roles
          </span>
          <a
            href={`/orgs/${slug}/billing`}
            className="text-sm text-[var(--pz-muted)] hover:text-[var(--pz-text)] pb-1 transition-colors"
          >
            Billing
          </a>
        </div>
      </div>

      <RolesManager
        orgId={org.id}
        orgSlug={slug}
        roles={roles}
        permissionCategories={PERMISSION_CATEGORIES}
        permissionLabels={PERMISSION_LABELS}
        actorHeldKeys={actorHeldKeys}
      />
    </div>
  )
}

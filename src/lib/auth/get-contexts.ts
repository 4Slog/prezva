import { createAdminClient } from '@/lib/supabase/admin'
import { ORG_ROLE_COLORS_CONTEXT } from '@/lib/ui/category-colors'

export type SwitcherContextItem = {
  type: 'personal' | 'org'
  label: string
  sublabel: string
  role?: string
  href: string
  color: string
  /** Stable id used to detect the currently active context. 'personal' or org slug. */
  id: string
}

const ORG_ROLE_COLOR = ORG_ROLE_COLORS_CONTEXT

const ORG_ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  staff: 'Staff',
}

/**
 * Server-side: load the contexts available to this user.
 * Personal hub is always included.
 */
export async function getUserContexts(userId: string): Promise<SwitcherContextItem[]> {
  const admin = createAdminClient()

  const { data: orgRows } = await admin
    .from('org_members')
    .select('role, organizations(id, name, slug)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })

  const orgs = (orgRows ?? []) as unknown as Array<{
    role: string
    organizations: { id: string; name: string; slug: string } | null
  }>

  const items: SwitcherContextItem[] = []

  for (const m of orgs) {
    if (!m.organizations) continue
    const role = m.role
    items.push({
      type: 'org',
      id: m.organizations.slug,
      label: m.organizations.name,
      sublabel: ORG_ROLE_LABEL[role] ?? role,
      role,
      href: '/dashboard',
      color: ORG_ROLE_COLOR[role] ?? '#94A3B8',
    })
  }

  items.push({
    type: 'personal',
    id: 'personal',
    label: 'Personal Hub',
    sublabel: 'All events and roles',
    href: '/me',
    // eslint-disable-next-line no-restricted-syntax
    color: '#94A3B8',
  })

  return items
}

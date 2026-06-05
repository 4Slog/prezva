import { cookies } from 'next/headers'

// Supabase join queries type the related row as an array even for many-to-one
// relations. Support both forms so this helper works with the raw getUserOrgs()
// return value without requiring callers to cast.
type OrgOrg = { slug?: string }
type OrgEntry = { organizations?: OrgOrg | OrgOrg[] | null }

function slugOf(entry: OrgEntry): string | undefined {
  const org = entry.organizations
  if (!org) return undefined
  if (Array.isArray(org)) return org[0]?.slug
  return org.slug
}

/**
 * Resolves the active org slug for the current user.
 *
 * Priority order (highest → lowest):
 *   1. pz_impersonate_org — checked by the CALLER before invoking this function.
 *      Super-admin override must win; do not let pz_active_org silently supersede it.
 *   2. pz_active_org — set by setActiveOrg() when the user explicitly switches.
 *      Only honoured if the slug is still present in the user's org list.
 *   3. orgs[0] — first org joined (oldest membership), the historical default.
 */
export async function resolveActiveOrgSlug(
  _userId: string,
  orgs: OrgEntry[],
): Promise<string | null> {
  const cookieStore = await cookies()
  const activeCookie = cookieStore.get('pz_active_org')?.value

  if (activeCookie) {
    const isMember = orgs.some((o) => slugOf(o) === activeCookie)
    if (isMember) return activeCookie
  }

  return slugOf(orgs[0]) ?? null
}

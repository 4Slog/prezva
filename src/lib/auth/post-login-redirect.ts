import { createAdminClient } from '@/lib/supabase/admin'

export async function getPostLoginRedirect(userId: string, userEmail?: string | null): Promise<string> {
  const admin = createAdminClient()
  const lowerEmail = userEmail?.toLowerCase() ?? null

  const [orgMemberships, registrations, speakerByUser, speakerByEmail, volunteerByUser, volunteerByEmail] = await Promise.all([
    admin.from('org_members').select('org_id, organizations(slug)').eq('user_id', userId),
    admin.from('registrations').select('id').eq('user_id', userId).limit(1),
    admin.from('speakers').select('id').eq('user_id', userId).limit(1),
    lowerEmail ? admin.from('speakers').select('id').eq('email', lowerEmail).limit(1) : Promise.resolve({ data: [] }),
    admin.from('volunteers').select('id').eq('user_id', userId).limit(1),
    lowerEmail ? admin.from('volunteers').select('id').eq('email', lowerEmail).limit(1) : Promise.resolve({ data: [] }),
  ])

  const orgs = orgMemberships.data ?? []

  if (orgs.length === 1) return '/dashboard'
  if (orgs.length > 1) return '/me'

  if ((registrations.data?.length ?? 0) > 0) return '/me'
  if ((speakerByUser.data?.length ?? 0) > 0) return '/me'
  if ((speakerByEmail.data?.length ?? 0) > 0) return '/me'
  if ((volunteerByUser.data?.length ?? 0) > 0) return '/me'
  if ((volunteerByEmail.data?.length ?? 0) > 0) return '/me'

  return '/me'
}

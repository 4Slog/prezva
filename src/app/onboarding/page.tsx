import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import OnboardingClient from './onboarding-client'

export default async function OnboardingPage() {
  const user = await requireUser()
  const admin = createAdminClient()

  // If the user already belongs to an org, send them to the dashboard.
  // /onboarding is only reachable now by explicit "Create an organization" click from /me.
  const { data: existingMembership } = await admin
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (existingMembership) {
    redirect('/dashboard')
  }

  return <OnboardingClient />
}

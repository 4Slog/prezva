import { requireEventOrgAccess } from '@/lib/auth/require-event-access'
import { getOrgPermissions } from '@/lib/auth/assert-permission'
import { createClient } from '@/lib/supabase/server'
import { getSurveys } from '@/lib/surveys/actions'
import SurveysClient from './client'

export default async function SurveysPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { user, event } = await requireEventOrgAccess(slug)
  const supabase = await createClient()

  const [surveys, intResult, permSet] = await Promise.all([
    getSurveys(event.id),
    supabase.from('org_integrations').select('provider, status').eq('org_id', event.org_id).eq('provider', 'google_forms').maybeSingle(),
    getOrgPermissions(event.org_id, user.id),
  ])
  const permissions = Array.from(permSet)
  const googleFormsConnected = intResult.data?.status === 'connected'

  return (
    <div style={{ padding: '2rem', maxWidth: 800 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Surveys</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 4 }}>Collect post-event feedback from attendees</p>
      </div>
      <SurveysClient surveys={surveys} eventId={event.id} slug={slug} orgId={event.org_id} googleFormsConnected={googleFormsConnected} permissions={permissions} />
    </div>
  )
}

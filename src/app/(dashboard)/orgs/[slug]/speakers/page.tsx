import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgPermissions } from '@/lib/auth/assert-permission'
import { SpeakerLibraryClient } from './speaker-library-client'

type Props = { params: Promise<{ slug: string }> }

function daysAgoDateString(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export default async function OrgSpeakerLibraryPage({ params }: Props) {
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

  const admin = createAdminClient()

  const permSet = await getOrgPermissions((org as any).id, user.id)
  const permissions = Array.from(permSet)

  const [{ data: libSpeakers }, { data: events }] = await Promise.all([
    admin
      .from('org_speakers')
      .select('*')
      .eq('org_id', (org as any).id)
      .order('times_spoken', { ascending: false }),
    admin
      .from('events')
      .select('id, title, slug, start_date')
      .eq('org_id', (org as any).id)
      .gte('start_date', daysAgoDateString(30))
      .order('start_date', { ascending: true })
      .limit(20),
  ])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--pz-text)' }}>Speaker Library</h1>
        <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
          Speakers who confirm their invitation are automatically added here. Add them to any event in one click.
        </p>
      </div>
      <SpeakerLibraryClient
        speakers={(libSpeakers ?? []) as any[]}
        events={(events ?? []) as any[]}
        permissions={permissions}
      />
    </div>
  )
}

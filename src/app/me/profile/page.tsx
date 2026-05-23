import { requireUser } from '@/lib/auth/get-user'
import { getUserProfile } from '@/lib/attendees/profile-actions'
import { createClient } from '@/lib/supabase/server'
import { ProfileClient } from './client'

export default async function MyProfilePage() {
  const authUser = await requireUser()
  const [profile, supabase] = await Promise.all([
    getUserProfile(),
    createClient(),
  ])

  const [{ data: speakerRoles }, { data: volunteerRoles }, { count: eventCount }] = await Promise.all([
    supabase
      .from('speakers')
      .select('id, event_id, event_role, status, events(title, slug, start_at, status)')
      .eq('email', authUser.email ?? '')
      .in('status', ['confirmed', 'invited'])
      .order('created_at', { ascending: false }),
    supabase
      .from('volunteers')
      .select('id, event_id, role, status, shift_response, events(title, slug, start_at, status)')
      .eq('email', authUser.email ?? '')
      .order('created_at', { ascending: false }),
    supabase
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', authUser.id)
      .in('status', ['confirmed', 'checked_in']),
  ])

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 4 }}>Your Profile</h1>
      <p style={{ fontSize: 14, color: 'var(--pz-muted)', marginBottom: 28 }}>
        This profile is shared across all events you attend.
      </p>

      {/* Identity summary stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: '2rem', flexWrap: 'wrap' as const }}>
        {[
          { label: 'Events attended', value: eventCount ?? 0, icon: '🎟️' },
          { label: 'Speaker roles', value: (speakerRoles ?? []).length, icon: '🎤' },
          { label: 'Volunteer roles', value: (volunteerRoles ?? []).length, icon: '🙋' },
        ].map(({ label, value, icon }) => (
          <div key={label} style={{ flex: 1, minWidth: 100, background: 'var(--pz-surface)',
                                     borderRadius: 10, padding: '0.875rem',
                                     border: '1px solid var(--pz-border)', textAlign: 'center' as const }}>
            <p style={{ fontSize: 22, margin: '0 0 2px' }}>{icon}</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--pz-teal)', margin: 0 }}>{value}</p>
            <p style={{ fontSize: 11, color: 'var(--pz-muted)', margin: 0 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Speaking roles */}
      {(speakerRoles ?? []).length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-muted)',
                       textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 10 }}>
            Speaking Roles
          </h2>
          {(speakerRoles as any[]).map(sp => (
            <div key={sp.id} style={{ display: 'flex', justifyContent: 'space-between',
                                       alignItems: 'center', padding: '0.75rem 0',
                                       borderBottom: '1px solid var(--pz-border)' }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--pz-text)', margin: 0 }}>
                  {(sp.events as any)?.title}
                </p>
                <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: '2px 0 0' }}>
                  {sp.event_role ?? 'Speaker'}{' · '}
                  {new Date((sp.events as any)?.start_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </p>
              </div>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                             background: sp.status === 'confirmed' ? 'var(--pz-teal)22' : '#F59E0B22',
                             color: sp.status === 'confirmed' ? 'var(--pz-teal)' : '#F59E0B' }}>
                {sp.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Volunteer roles */}
      {(volunteerRoles ?? []).length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-muted)',
                       textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 10 }}>
            Volunteer Roles
          </h2>
          {(volunteerRoles as any[]).map(vol => (
            <div key={vol.id} style={{ display: 'flex', justifyContent: 'space-between',
                                        alignItems: 'center', padding: '0.75rem 0',
                                        borderBottom: '1px solid var(--pz-border)' }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--pz-text)', margin: 0 }}>
                  {(vol.events as any)?.title}
                </p>
                <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: '2px 0 0' }}>
                  {vol.role ?? 'Volunteer'}{' · '}
                  {new Date((vol.events as any)?.start_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </p>
              </div>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                             background: vol.shift_response === 'confirmed' ? 'var(--pz-teal)22' : 'var(--pz-surface-2)',
                             color: vol.shift_response === 'confirmed' ? 'var(--pz-teal)' : 'var(--pz-muted)' }}>
                {vol.shift_response === 'confirmed' ? 'Confirmed' : vol.shift_response === 'declined' ? 'Declined' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      )}

      <ProfileClient
        email={authUser.email ?? ''}
        initial={{
          display_name: profile?.display_name ?? '',
          bio: profile?.bio ?? '',
          pronouns: profile?.pronouns ?? '',
          linkedin_url: profile?.linkedin_url ?? '',
          twitter_url: profile?.twitter_url ?? '',
          website_url: profile?.website_url ?? '',
          show_in_directory: profile?.show_in_directory ?? false,
          interests: profile?.interests ?? [],
        }}
      />
    </div>
  )
}

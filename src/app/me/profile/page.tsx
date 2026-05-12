import { requireUser } from '@/lib/auth/get-user'
import { getUserProfile } from '@/lib/attendees/profile-actions'
import { ProfileClient } from './client'

export default async function MyProfilePage() {
  const user = await requireUser()
  const profile = await getUserProfile()

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 4 }}>Your Profile</h1>
      <p style={{ fontSize: 14, color: 'var(--pz-muted)', marginBottom: 28 }}>
        This profile is shared across all events you attend.
      </p>
      <ProfileClient
        email={user.email ?? ''}
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

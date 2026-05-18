import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { VolunteerScanClient } from './scan-client'

interface Props { params: Promise<{ token: string }> }

export default async function VolunteerScanPage({ params }: Props) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: volunteer } = await admin.rpc('get_volunteer_by_token', { p_token: token })
  if (!volunteer) notFound()

  const allowedRoles = ['check-in', 'registration-desk']
  if (!allowedRoles.includes(volunteer.role)) notFound()

  return <VolunteerScanClient token={token} volunteerName={volunteer.name} />
}

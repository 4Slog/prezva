import { requireAdmin } from '@/lib/admin/gate'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const admin = createAdminClient()

  // 1. Fetch all event IDs for this org
  const { data: events } = await admin
    .from('events')
    .select('id')
    .eq('org_id', id)

  const eventIds = (events ?? []).map(e => e.id)

  // 2. Cancel all non-ended events
  if (eventIds.length) {
    await admin
      .from('events')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .in('id', eventIds)
      .not('status', 'in', '("ended","archived","cancelled")')

    // 3. Anonymize confirmed registrations
    const { data: regs } = await admin
      .from('registrations')
      .select('id')
      .in('event_id', eventIds)
      .eq('status', 'confirmed')

    const regIds = (regs ?? []).map(r => r.id)
    if (regIds.length) {
      for (const regId of regIds) {
        await admin
          .from('registrations')
          .update({
            attendee_name: 'Deleted User',
            attendee_email: `deleted-${regId}@redacted.local`,
            attendee_phone: null,
            attendee_company: null,
          })
          .eq('id', regId)
      }
    }
  }

  // 4. Mark org as deleted
  const { error } = await admin
    .from('organizations')
    .update({
      deleted_at: new Date().toISOString(),
      suspended: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Note: Stripe Connect deauthorization must be completed separately via
  // the Stripe dashboard or a background job using stripe_account_id.

  redirect('/admin/orgs')
}

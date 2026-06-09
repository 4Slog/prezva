import { createAdminClient } from '@/lib/supabase/admin'

export type AttendeeState = 'checked_in' | 'registered' | 'public'

export interface ResolvedAttendeeState {
  state: AttendeeState
  reg: {
    id: string
    attendee_name: string | null
    attendee_email: string | null
    qr_code: string | null
    status: string
    user_id: string | null
    amount_paid_cents: number | null
  } | null
  checkedInAt: string | null
}

export async function resolveAttendeeState(
  eventId: string,
  regId: string | null | undefined,
  admin?: ReturnType<typeof createAdminClient>,
): Promise<ResolvedAttendeeState> {
  if (!regId) return { state: 'public', reg: null, checkedInAt: null }

  const client = admin ?? createAdminClient()

  const { data: reg } = await client
    .from('registrations')
    .select('id, attendee_name, attendee_email, qr_code, status, user_id, amount_paid_cents')
    .eq('id', regId)
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
    .maybeSingle()

  if (!reg) return { state: 'public', reg: null, checkedInAt: null }

  const { data: ci } = await client
    .from('check_ins')
    .select('checked_in_at')
    .eq('registration_id', reg.id)
    .eq('event_id', eventId)
    .limit(1)
    .maybeSingle()

  return {
    state: ci ? 'checked_in' : 'registered',
    reg,
    checkedInAt: (ci as any)?.checked_in_at ?? null,
  }
}

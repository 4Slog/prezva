import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendVolunteerInvite } from '@/lib/trigger'
import { z } from 'zod'

const Schema = z.object({
  event_id:    z.string().uuid(),
  name:        z.string().min(1).max(120),
  email:       z.string().email(),
  phone:       z.string().optional(),
  role:        z.enum(['check-in', 'session-monitor', 'registration-desk', 'vip-support', 'general']),
  shift_start: z.string().optional(),
  shift_end:   z.string().optional(),
  notes:       z.string().optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser()
    const { id } = await params
    const body = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    // Admin client: insert volunteer bypassing RLS (org staff already validated by requireUser + org check)
    const admin = createAdminClient()
    const { data: event } = await admin
      .from('events')
      .select('id, title, start_at, slug')
      .eq('slug', id)
      .maybeSingle()

    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const { data: volunteer, error } = await admin
      .from('volunteers')
      .insert({
        event_id:    event.id,
        name:        parsed.data.name,
        email:       parsed.data.email,
        phone:       parsed.data.phone ?? null,
        role:        parsed.data.role,
        shift_start: parsed.data.shift_start ?? null,
        shift_end:   parsed.data.shift_end ?? null,
        notes:       parsed.data.notes ?? null,
        status:      'invited',
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This email is already registered as a volunteer for this event' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Enqueue invite email (non-blocking)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
    void sendVolunteerInvite({
      volunteerName:  volunteer.name,
      volunteerEmail: volunteer.email,
      volunteerRole:  volunteer.role,
      eventTitle:     event.title,
      eventDate:      event.start_at,
      shiftStart:     volunteer.shift_start ?? null,
      shiftEnd:       volunteer.shift_end ?? null,
      portalUrl:      `${appUrl}/volunteer/${volunteer.portal_access_token}`,
    })

    return NextResponse.json({ volunteer })
  } catch (err: any) {
    if (err?.digest?.startsWith('NEXT_REDIRECT')) throw err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

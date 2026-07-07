import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionIdentity } from '@/lib/auth/session-identity'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ handoutId: string }> }) {
  const { handoutId } = await params
  const supabase = await createClient()

  let storagePath: string | null = null

  // Path A — authed attendees + staff resolve via RLS (auth.uid()).
  const { data: handout } = await supabase
    .from('session_handouts')
    .select('storage_path')
    .eq('id', handoutId)
    .maybeSingle()

  if (handout) {
    storagePath = (handout as any).storage_path
  } else {
    // Path B — claim-level attendee (pz_reg_ cookie, no auth.uid()).
    const admin = createAdminClient()
    const { data: h } = await admin
      .from('session_handouts')
      .select('storage_path, session_id')
      .eq('id', handoutId)
      .maybeSingle()
    if (h) {
      const { data: sess } = await admin
        .from('sessions')
        .select('event_id')
        .eq('id', (h as any).session_id)
        .maybeSingle()
      const eventId = (sess as any)?.event_id ?? null
      if (eventId) {
        const { data: ev } = await admin
          .from('events')
          .select('slug')
          .eq('id', eventId)
          .maybeSingle()
        const slug = (ev as any)?.slug ?? null
        if (slug) {
          const identity = await getSessionIdentity(slug)
          if (identity.type === 'registration' && identity.eventId === eventId) {
            storagePath = (h as any).storage_path
          }
        }
      }
    }
  }

  if (!storagePath) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const admin = createAdminClient()
  const { data } = await admin.storage
    .from('speaker-handouts')
    .createSignedUrl(storagePath, 300)

  if (!data?.signedUrl) return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 })

  return NextResponse.redirect(data.signedUrl)
}

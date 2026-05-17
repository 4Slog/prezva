import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// GET /api/upload/event-document/signed?storagePath=eventId/documents/file.pdf
// Using a query param instead of a dynamic segment because storage paths contain
// slashes which Next.js [path] catch-all segments mangle unpredictably.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const storagePath = req.nextUrl.searchParams.get('storagePath')
  if (!storagePath) return NextResponse.json({ error: 'storagePath required' }, { status: 400 })

  // Verify the user has access to this event's documents by checking org membership
  // Storage path format: eventId/... — extract eventId from path
  const eventId = storagePath.split('/')[0]
  if (!eventId) return NextResponse.json({ error: 'Invalid storage path' }, { status: 400 })

  const { data: event } = await supabase
    .from('events')
    .select('org_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', event.org_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data } = await admin.storage
    .from('event-documents')
    .createSignedUrl(storagePath, 3600)
  if (!data) return NextResponse.json({ error: 'Could not generate signed URL' }, { status: 500 })
  return NextResponse.json({ signedUrl: data.signedUrl })
}

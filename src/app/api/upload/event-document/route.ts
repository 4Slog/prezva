import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_SIZE = 20 * 1024 * 1024

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const eventId = formData.get('eventId') as string | null
  const documentType = (formData.get('documentType') as string) || 'event'
  const entityId = formData.get('entityId') as string | null

  if (!file || !eventId) return NextResponse.json({ error: 'file and eventId required' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'Only PDF, Word, and PowerPoint files allowed' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Max 20MB' }, { status: 400 })

  // Verify user is an org member for this event — prevents cross-tenant uploads
  const { data: event } = await supabase.from('events').select('org_id').eq('id', eventId).maybeSingle()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  const { data: member } = await supabase.from('org_members').select('role').eq('org_id', event.org_id).eq('user_id', user.id).maybeSingle()
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const folder = documentType === 'session' && entityId ? `${eventId}/sessions/${entityId}` : `${eventId}/documents`
  const path = `${folder}/${Date.now()}-${file.name.replace(/[^a-z0-9.-]/gi, '_')}`

  const admin = createAdminClient()
  const bytes = await file.arrayBuffer()
  const { data, error } = await admin.storage
    .from('event-documents')
    .upload(path, bytes, { contentType: file.type, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (documentType === 'session' && entityId) {
    const { error: dbErr } = await admin.from('session_documents').insert({
      session_id: entityId,
      event_id: eventId,
      name: file.name,
      storage_path: data.path,
      file_size_bytes: file.size,
      mime_type: file.type,
      uploaded_by: user.id,
    })
    if (dbErr) {
      await admin.storage.from('event-documents').remove([data.path])
      return NextResponse.json({ error: dbErr.message }, { status: 500 })
    }
  } else {
    const { error: dbErr } = await admin.from('event_documents').insert({
      event_id: eventId,
      name: file.name,
      storage_path: data.path,
      file_size_bytes: file.size,
      mime_type: file.type,
      uploaded_by: user.id,
    })
    if (dbErr) {
      await admin.storage.from('event-documents').remove([data.path])
      return NextResponse.json({ error: dbErr.message }, { status: 500 })
    }
  }

  const { data: signedData } = await admin.storage
    .from('event-documents')
    .createSignedUrl(data.path, 3600)

  return NextResponse.json({ path: data.path, signedUrl: signedData?.signedUrl })
}

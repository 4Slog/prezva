import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 5 * 1024 * 1024

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const eventId = formData.get('eventId') as string | null
  const caption = formData.get('caption') as string | null

  if (!file || !eventId) return NextResponse.json({ error: 'file and eventId required' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: `File type ${file.type} not allowed` }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })

  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  const path = `${eventId}/${user.id}/${Date.now()}.${ext}`

  const admin = createAdminClient()
  const bytes = await file.arrayBuffer()
  const { data, error: uploadError } = await admin.storage
    .from('event-photos')
    .upload(path, bytes, { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { error: dbError } = await admin
    .from('photo_contest_entries')
    .insert({ event_id: eventId, user_id: user.id, caption: caption || null, storage_path: path })

  if (dbError) {
    await admin.storage.from('event-photos').remove([path])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  const { data: urlData } = admin.storage.from('event-photos').getPublicUrl(data.path)
  return NextResponse.json({ url: urlData.publicUrl, path })
}

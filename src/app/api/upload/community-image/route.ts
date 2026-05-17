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

  if (!file || !eventId) return NextResponse.json({ error: 'file and eventId required' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'Images only' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Max 5MB' }, { status: 400 })

  // Only confirmed registrants for this event can post community images
  const { data: reg } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .maybeSingle()
  if (!reg) return NextResponse.json({ error: 'Forbidden — must be a confirmed registrant' }, { status: 403 })

  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  const path = `${eventId}/community/${user.id}/${Date.now()}.${ext}`
  const admin = createAdminClient()
  const bytes = await file.arrayBuffer()

  const { data, error } = await admin.storage
    .from('event-photos')
    .upload(path, bytes, { contentType: file.type, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: urlData } = admin.storage.from('event-photos').getPublicUrl(data.path)
  return NextResponse.json({ url: urlData.publicUrl })
}

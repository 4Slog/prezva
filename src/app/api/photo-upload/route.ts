import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const caption = formData.get('caption') as string | null
  const eventId = formData.get('eventId') as string | null

  if (!file || !eventId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = await createClient()
  const user = await supabase.auth.getUser()

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${eventId}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('event-photos')
    .upload(path, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: entry, error: dbError } = await supabase
    .from('photo_contest_entries')
    .insert({
      event_id: eventId,
      user_id: user.data.user?.id,
      caption: caption || null,
      storage_path: path,
    })
    .select()
    .single()

  if (dbError) {
    await supabase.storage.from('event-photos').remove([path])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const url = `${supabaseUrl}/storage/v1/object/public/event-photos/${path}`

  return NextResponse.json({ entry, url })
}

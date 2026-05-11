import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateSpeakerToken } from '@/lib/speaker/speaker-actions'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const sessionId = formData.get('sessionId') as string
  const speakerId = formData.get('speakerId') as string
  const eventId = formData.get('eventId') as string
  const token = formData.get('token') as string

  if (!file || !sessionId || !speakerId || !eventId || !token) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const tokenData = await validateSpeakerToken(token)
  if (!tokenData || tokenData.speaker_id !== speakerId || tokenData.event_id !== eventId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${eventId}/${speakerId}/${sessionId}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('speaker-handouts')
    .upload(path, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { error: dbError } = await supabase.from('session_handouts').insert({
    session_id: sessionId,
    speaker_id: speakerId,
    filename: file.name,
    storage_path: path,
  })

  if (dbError) {
    await supabase.storage.from('speaker-handouts').remove([path])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

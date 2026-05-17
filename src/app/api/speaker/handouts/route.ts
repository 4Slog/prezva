import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateSpeakerToken } from '@/lib/speaker/speaker-actions'

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]
const MAX_SIZE = 20 * 1024 * 1024

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

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only PDF and PowerPoint files allowed' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })
  }

  const admin = createAdminClient()
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${eventId}/${speakerId}/${sessionId}/${Date.now()}.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: uploadError } = await admin.storage
    .from('speaker-handouts')
    .upload(path, bytes, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { error: dbError } = await admin.from('session_handouts').insert({
    session_id: sessionId,
    speaker_id: speakerId,
    filename: file.name,
    storage_path: path,
  })

  if (dbError) {
    await admin.storage.from('speaker-handouts').remove([path])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

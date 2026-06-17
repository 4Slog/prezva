import { createHmac } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getSessionIdentity } from '@/lib/auth/session-identity'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 2 * 1024 * 1024

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  // Resolve identity
  const identity = await getSessionIdentity(slug)

  let registrationId: string

  if (identity.type === 'anonymous') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  } else if (identity.type === 'registration') {
    registrationId = identity.registrationId
  } else {
    // identity.type === 'user' — look up their registration for this event
    const admin = createAdminClient()

    // Get event_id from slug
    const { data: event } = await admin
      .from('events')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Use RLS-scoped client so we only see the current user's registrations
    const supabase = await createClient()
    const { data: reg } = await supabase
      .from('registrations')
      .select('id')
      .eq('event_id', event.id)
      .neq('status', 'cancelled')
      .single()

    if (!reg) {
      return NextResponse.json({ error: 'No registration for this event' }, { status: 401 })
    }

    registrationId = (reg as { id: string }).id
  }

  // Validate file
  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP allowed' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Max 2MB' }, { status: 400 })
  }

  // Compute HMAC-based storage path (registrationId never appears in path)
  const secret = process.env.EMBEDDED_SESSION_SECRET
  if (!secret) {
    console.error('[photo-upload] EMBEDDED_SESSION_SECRET is not set')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
  const hmacHex = createHmac('sha256', secret).update(registrationId).digest('hex')
  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  const path = `attendee-photos/${hmacHex}.${ext}`

  // Upload to storage
  const admin = createAdminClient()
  const bytes = await file.arrayBuffer()

  const { data, error } = await admin.storage
    .from('user-avatars')
    .upload(path, bytes, { contentType: file.type, upsert: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: urlData } = admin.storage.from('user-avatars').getPublicUrl(data.path)

  return NextResponse.json({ url: urlData.publicUrl })
}

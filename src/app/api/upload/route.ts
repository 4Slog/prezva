import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'

type UploadType = 'org-logo' | 'event-cover' | 'speaker-photo' | 'sponsor-logo' | 'venue-map'

const BUCKET_MAP: Record<UploadType, string> = {
  'org-logo':      'org-assets',
  'event-cover':   'event-assets',
  'speaker-photo': 'org-assets',
  'sponsor-logo':  'org-assets',
  'venue-map':     'event-assets',
}

const SIZE_MAP: Record<UploadType, number> = {
  'org-logo':      2 * 1024 * 1024,
  'event-cover':   5 * 1024 * 1024,
  'speaker-photo': 2 * 1024 * 1024,
  'sponsor-logo':  2 * 1024 * 1024,
  'venue-map':     5 * 1024 * 1024,
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']

export async function POST(req: NextRequest) {
  const user = await requireUser()

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const uploadType = formData.get('type') as UploadType | null
  const entityId = formData.get('entityId') as string | null
  // orgId must be passed explicitly for all upload types so we can verify membership
  const orgId = formData.get('orgId') as string | null

  if (!file || !uploadType || !entityId || !orgId)
    return NextResponse.json({ error: 'file, type, entityId, and orgId are required' }, { status: 400 })
  if (!BUCKET_MAP[uploadType])
    return NextResponse.json({ error: `Unknown upload type: ${uploadType}` }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: `File type ${file.type} not allowed` }, { status: 400 })
  if (file.size > SIZE_MAP[uploadType])
    return NextResponse.json({ error: `File too large for ${uploadType}` }, { status: 400 })

  // Verify the user is a member of the org that owns this entity
  const supabase = await createClient()
  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const ext = file.type === 'image/svg+xml' ? 'svg' : file.type.split('/')[1].replace('jpeg', 'jpg')
  const filename = `${uploadType}/${entityId}/${Date.now()}.${ext}`
  const admin = createAdminClient()
  const bytes = await file.arrayBuffer()
  const bucket = BUCKET_MAP[uploadType]

  const { data, error } = await admin.storage
    .from(bucket)
    .upload(filename, bytes, { contentType: file.type, upsert: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: urlData } = admin.storage.from(bucket).getPublicUrl(data.path)
  return NextResponse.json({ url: urlData.publicUrl, path: data.path, bucket })
}

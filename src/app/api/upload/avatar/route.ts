import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 2 * 1024 * 1024

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'Only JPEG, PNG, WebP allowed' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Max 2MB' }, { status: 400 })

  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  const path = `${user.id}/avatar.${ext}`
  const admin = createAdminClient()
  const bytes = await file.arrayBuffer()

  const { data, error } = await admin.storage
    .from('user-avatars')
    .upload(path, bytes, { contentType: file.type, upsert: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: urlData } = admin.storage.from('user-avatars').getPublicUrl(data.path)

  const { error: profileError } = await admin
    .from('profiles')
    .update({ avatar_url: urlData.publicUrl })
    .eq('id', user.id)

  if (profileError) {
    // Upload succeeded but profile update failed — still return the URL
    // so the client can display it; the hidden input will submit it on next save
    console.error('[avatar-upload] profile update failed:', profileError.message)
  }

  return NextResponse.json({ url: urlData.publicUrl })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ handoutId: string }> }) {
  const { handoutId } = await params
  const supabase = await createClient()

  const { data: handout } = await supabase
    .from('session_handouts')
    .select('storage_path, filename')
    .eq('id', handoutId)
    .single()

  if (!handout) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data } = await supabase.storage
    .from('speaker-handouts')
    .createSignedUrl((handout as any).storage_path, 300)

  if (!data?.signedUrl) return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 })

  return NextResponse.redirect(data.signedUrl)
}

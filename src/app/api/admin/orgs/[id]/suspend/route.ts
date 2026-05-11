import { requireAdmin } from '@/lib/admin/gate'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const admin = createAdminClient()

  const { error } = await admin
    .from('organizations')
    .update({ suspended: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  redirect(`/admin/orgs/${id}`)
}

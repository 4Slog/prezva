import { requireAdmin } from '@/lib/admin/gate'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin()
  const { slug } = await params
  const admin = createAdminClient()

  const { data: org } = await admin
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()

  if (!org) redirect('/admin/orgs?error=org_not_found')

  const cookieStore = await cookies()
  cookieStore.set('pz_impersonate_org', JSON.stringify({ id: org.id, name: org.name, slug: org.slug }), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 3600,
    path: '/',
  })

  redirect('/dashboard')
}

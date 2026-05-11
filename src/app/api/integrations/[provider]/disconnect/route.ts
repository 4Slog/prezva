import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { getAdapter } from '@/lib/integrations/_shared/registry'

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  await requireUser()
  const { provider } = await params
  const formData = await req.formData()
  const orgId = formData.get('orgId') as string
  const returnTo = (formData.get('returnTo') as string) ?? '/dashboard'
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 })
  try {
    const adapter = getAdapter(provider)
    await adapter.disconnect(orgId)
  } catch {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
  }
  return NextResponse.redirect(new URL(returnTo, req.url))
}

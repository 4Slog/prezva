import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { googleFormsAdapter } from '@/lib/integrations/google-forms/adapter'

export async function POST(req: Request) {
  await requireUser()
  const { orgId, eventId, formId } = await req.json()
  if (!orgId || !eventId || !formId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const result = await googleFormsAdapter.importForm(orgId, eventId, formId)
  return NextResponse.json(result)
}

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { ghlAdapter, REDIRECT_URI, STATE_COOKIE } from '@/lib/integrations/ghl/adapter'

export async function GET(req: NextRequest) {
  const user = await requireUser()

  const orgId = req.nextUrl.searchParams.get('org_id')
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  try {
    await assertPermission(orgId, user.id, 'org.settings')
  } catch {
    const msg = encodeURIComponent('You do not have access to connect this integration')
    return NextResponse.redirect(new URL(`/dashboard?error=${msg}`, req.nextUrl.origin))
  }

  // Nonce binds this state to the browser session that started the flow, so a
  // forged callback (attacker's own valid `code` + a state claiming a victim's
  // orgId) can't be laundered through a victim who legitimately owns that org.
  const nonce = randomBytes(32).toString('base64url')
  const state = Buffer.from(JSON.stringify({ orgId, userId: user.id, nonce })).toString('base64url')

  const cookieStore = await cookies()
  cookieStore.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/oauth/callback',
    maxAge: 600,
  })

  const authUrl = ghlAdapter.getAuthUrl(orgId, REDIRECT_URI, state)

  return NextResponse.redirect(authUrl, 302)
}

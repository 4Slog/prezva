import { NextRequest, NextResponse } from 'next/server'
import { generateAppleWalletPass } from '@/lib/passes/apple-pass'
import { authorizePassRequest } from '@/lib/passes/authorize-pass'

// Same gate as the Google route (?t=<qr_code> or the signed-in owner, and a
// confirmed registration), checked before anything else — including before
// the "not configured" answer — so the route is safe the day Apple Wallet
// certificates are added.
export async function GET(req: NextRequest, { params }: { params: Promise<{ registrationId: string }> }) {
  const { registrationId } = await params
  const auth = await authorizePassRequest(registrationId, req.nextUrl.searchParams.get('t'))
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const result = await generateAppleWalletPass(auth.registrationId)

  if (result.error) {
    const status = result.error === 'Apple Wallet not configured' ? 501 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  return new NextResponse(result.buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="event-pass.pkpass"`,
    },
  })
}

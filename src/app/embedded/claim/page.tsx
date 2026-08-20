import { cookies } from 'next/headers'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { ClaimFlow } from './claim-flow'

type Props = { searchParams: Promise<{ sso?: string }> }

export default async function EmbeddedClaimPage({ searchParams }: Props) {
  const { sso } = await searchParams
  // O70 breadcrumb: set by /embedded/sso after a successful handshake. It rides
  // the URL, so it survives the third-party-cookie blocking that eats the session.
  const fromSso = sso === '1'

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value

  let hasSession = false
  if (token) {
    try {
      await verifyEmbeddedSession(token)
      hasSession = true
    } catch {
      hasSession = false
    }
  }

  // No session. fromSso distinguishes the two causes (O70): the SSO handshake
  // succeeded and set a cookie the browser did not keep or that has since
  // expired, versus a genuine non-embedded visit.
  if (!hasSession) {
    if (fromSso) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-base font-medium text-gray-700">
            Your Prezva session expired
          </p>
          <p className="text-sm text-gray-400">
            Reload this page and GoHighLevel will sign you back in. If it keeps
            happening, your browser may be blocking cookies for prezva.app — allow
            them for this site and try again.
          </p>
        </div>
      )
    }

    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-base font-medium text-gray-700">
          Open this from inside GoHighLevel
        </p>
        <p className="text-sm text-gray-400">
          This page is only accessible as an embedded app within your GHL account.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <ClaimFlow />
      </div>
    </div>
  )
}

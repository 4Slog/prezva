import { cookies } from 'next/headers'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { ClaimFlow } from './claim-flow'

export default async function EmbeddedClaimPage() {
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

  if (!hasSession) {
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

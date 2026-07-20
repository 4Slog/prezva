'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// GHL Custom Page entry point (GE-8 batch 4). Performs the REQUEST_USER_DATA
// postMessage handshake documented at
// marketplace.gohighlevel.com/docs/other/user-context-marketplace-apps,
// exchanges the encrypted payload for an embedded session via
// /api/embedded/sso, then hands off to /embedded/events. Alongside, not
// replacing, the ?k= launch flow.

const RESPONSE_TIMEOUT_MS = 10_000

type Status = 'waiting' | 'exchanging' | 'error'

interface RequestUserDataResponse {
  message: string
  payload: string
}

function isRequestUserDataResponse(data: unknown): data is RequestUserDataResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { message?: unknown }).message === 'REQUEST_USER_DATA_RESPONSE' &&
    typeof (data as { payload?: unknown }).payload === 'string'
  )
}

export default function EmbeddedSsoPage() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('waiting')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let settled = false

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      setStatus('error')
      setErrorMessage('No response from GoHighLevel. Try reopening this page from inside GHL.')
    }, RESPONSE_TIMEOUT_MS)

    async function handleMessage(event: MessageEvent) {
      if (settled || !isRequestUserDataResponse(event.data)) return

      settled = true
      clearTimeout(timeout)
      setStatus('exchanging')

      try {
        const res = await fetch('/api/embedded/sso', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ encryptedData: event.data.payload }),
        })

        if (!res.ok) {
          setStatus('error')
          setErrorMessage('Could not verify your session. Please try again.')
          return
        }

        const result = await res.json()
        router.push(result.next ?? '/embedded/events')
      } catch {
        setStatus('error')
        setErrorMessage('Something went wrong. Please try again.')
      }
    }

    window.addEventListener('message', handleMessage)
    window.parent.postMessage({ message: 'REQUEST_USER_DATA' }, '*')

    return () => {
      clearTimeout(timeout)
      window.removeEventListener('message', handleMessage)
    }
  }, [router])

  if (status === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-base font-medium text-gray-700">We couldn&apos;t sign you in</p>
        <p className="text-sm text-gray-400">{errorMessage}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm text-gray-400">Signing you in…</p>
    </div>
  )
}

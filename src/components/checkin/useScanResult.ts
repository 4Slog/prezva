'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// O135: how a scan result stays on screen, shared by the dashboard door, the
// embedded door and the session scanner.
//   refusal — Do not admit, not on the list, errors: stays until "Next guest"
//             (next()), or until a manual search / typed code replaces it.
//             Camera frames are ignored while it is up.
//   success — clears after SUCCESS_MS; the same code read by the camera within
//             DUPLICATE_MS of the success is ignored.
//   info    — queued / pending notices: clear after INFO_MS.
export type ScanResultKind = 'success' | 'refusal' | 'info'

export const SUCCESS_MS = 3000
export const DUPLICATE_MS = 3000
export const INFO_MS = 4000

export function useScanResult<T>() {
  const [shown, setShown] = useState<{ value: T; kind: ScanResultKind } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Refs, not state: the camera callback must see the latest value synchronously.
  const refusalUpRef = useRef(false)
  const lastSuccessRef = useRef<{ code: string; at: number } | null>(null)

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }

  const next = useCallback(() => {
    clearTimer()
    refusalUpRef.current = false
    setShown(null)
  }, [])

  // `code` (when known) arms the duplicate guard for a success.
  const show = useCallback((value: T, kind: ScanResultKind, code?: string) => {
    clearTimer()
    refusalUpRef.current = kind === 'refusal'
    setShown({ value, kind })
    if (kind === 'success' && code) lastSuccessRef.current = { code: code.toLowerCase(), at: Date.now() }
    if (kind !== 'refusal') {
      timerRef.current = setTimeout(() => { timerRef.current = null; setShown(null) }, kind === 'success' ? SUCCESS_MS : INFO_MS)
    }
  }, [])

  // Gate for camera frames only; manual and typed entries always go through.
  const cameraMayScan = useCallback((code: string) => {
    if (refusalUpRef.current) return false
    const last = lastSuccessRef.current
    if (last && last.code === code.toLowerCase() && Date.now() - last.at < DUPLICATE_MS) return false
    return true
  }, [])

  useEffect(() => clearTimer, [])

  return { shown, show, next, cameraMayScan }
}

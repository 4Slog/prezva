'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type SaveResult = { success: true } | { error: string }

// One settings <form>: submits to its bound server action and always shows the
// result. The fields are uncontrolled; `resetKey` (derived from the stored values)
// remounts them after a save so they re-read the fresh defaults, e.g. the start
// time re-displayed in a newly chosen timezone.
export function SettingsSectionForm({
  action,
  resetKey,
  className,
  successMessage = 'Saved.',
  children,
}: {
  action: (formData: FormData) => Promise<SaveResult>
  resetKey: string
  className?: string
  successMessage?: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<SaveResult | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setResult(null)
    startTransition(async () => {
      try {
        const res = await action(fd)
        setResult(res)
        if ('success' in res) router.refresh()
      } catch (err) {
        setResult({ error: err instanceof Error ? err.message : 'Unexpected error' })
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className={className} aria-busy={pending}>
      <div key={resetKey} className="contents">{children}</div>
      {pending && <p className="text-xs text-[var(--pz-muted)]">Saving…</p>}
      {!pending && result && 'error' in result && (
        <p role="alert" className="text-sm text-[var(--pz-error)]">{result.error}</p>
      )}
      {!pending && result && 'success' in result && (
        <p role="status" className="text-sm text-[var(--pz-success-fill)]">{successMessage}</p>
      )}
    </form>
  )
}

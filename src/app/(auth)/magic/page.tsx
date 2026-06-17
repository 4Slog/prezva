'use client'

import { Suspense, useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import { sendMagicLink } from '@/lib/auth/actions'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

export default function MagicPage() {
  return (
    <Suspense fallback={<MagicFormView next="" emailDefault="" state={{}} />}>
      <MagicFormConnected />
    </Suspense>
  )
}

function MagicFormConnected() {
  const params = useSearchParams()
  const rawNext = params.get('next') ?? ''
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : ''
  const emailDefault = params.get('email') ?? ''
  const [state, formAction] = useActionState(sendMagicLink, {})
  return <MagicFormView next={next} emailDefault={emailDefault} state={state} formAction={formAction} />
}

function MagicFormView({
  next,
  emailDefault,
  state,
  formAction,
}: {
  next: string
  emailDefault: string
  state: { error?: string; success?: string }
  formAction?: (formData: FormData) => void
}) {
  return (
    <div
      className="rounded-xl p-8"
      style={{
        background: 'var(--pz-surface)',
        border: '1px solid var(--pz-border)',
      }}
    >
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>Get your sign-in link</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--pz-muted)' }}>
          We&apos;ll email you a link to sign in — no password needed.
        </p>
      </div>

      {state?.error && (
        <div
          className="mb-4 rounded-lg p-3 text-sm"
          style={{
            background: 'var(--pz-error-bg)',
            border: '1px solid var(--pz-error)',
            color: 'var(--pz-error)',
          }}
        >
          {state.error}
        </div>
      )}
      {state?.success && (
        <div
          className="mb-4 rounded-lg p-3 text-sm"
          style={{
            background: 'var(--pz-success-bg)',
            border: '1px solid var(--pz-success)',
            color: 'var(--pz-success)',
          }}
        >
          {state.success}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <Field label="Email" htmlFor="email">
          <input
            id="email" name="email" type="email" required autoComplete="email"
            placeholder="you@example.com"
            defaultValue={emailDefault}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pz-teal)]"
            style={{
              background: 'var(--pz-surface-2)',
              border: '1px solid var(--pz-border)',
              color: 'var(--pz-text)',
            }}
          />
        </Field>
        <Button type="submit" className="w-full">Email me a sign-in link</Button>
      </form>
    </div>
  )
}

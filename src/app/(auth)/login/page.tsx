'use client'

import { Suspense, useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signIn } from '@/lib/auth/actions'
import { GoogleOAuthButton } from '@/components/auth/GoogleOAuthButton'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormView next="" state={{}} signupHref="/signup" />}>
      <LoginFormConnected />
    </Suspense>
  )
}

function LoginFormConnected() {
  const params = useSearchParams()
  const rawNext = params.get('next') ?? ''
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : ''
  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'
  const [state, formAction] = useActionState(signIn, {})
  return <LoginFormView next={next} state={state} formAction={formAction} signupHref={signupHref} />
}

function LoginFormView({
  next,
  state,
  formAction,
  signupHref,
}: {
  next: string
  state: { error?: string }
  formAction?: (formData: FormData) => void
  signupHref: string
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
        <h1 className="text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>Welcome back</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--pz-muted)' }}>
          Sign in to your Prezva account
        </p>
      </div>

      <GoogleOAuthButton mode="signin" />

      <div className="my-5 flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: 'var(--pz-border)' }} />
        <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--pz-muted)' }}>or</span>
        <div className="flex-1 h-px" style={{ background: 'var(--pz-border)' }} />
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

      <form action={formAction} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <Field label="Email" htmlFor="email">
          <input
            id="email" name="email" type="email" required autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pz-teal)]"
            style={{
              background: 'var(--pz-surface-2)',
              border: '1px solid var(--pz-border)',
              color: 'var(--pz-text)',
            }}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <input
            id="password" name="password" type="password" required autoComplete="current-password"
            placeholder="••••••••"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pz-teal)]"
            style={{
              background: 'var(--pz-surface-2)',
              border: '1px solid var(--pz-border)',
              color: 'var(--pz-text)',
            }}
          />
        </Field>
        <div className="flex justify-end">
          <a href="/forgot-password" className="text-sm hover:underline" style={{ color: 'var(--pz-teal-ink)' }}>
            Forgot password?
          </a>
        </div>
        <Button type="submit" className="w-full">Sign in</Button>
      </form>

      <p className="mt-6 text-center text-sm" style={{ color: 'var(--pz-muted)' }}>
        Don&apos;t have an account?{' '}
        <Link href={signupHref} className="font-medium hover:underline" style={{ color: 'var(--pz-teal-ink)' }}>
          Sign up
        </Link>
      </p>
    </div>
  )
}

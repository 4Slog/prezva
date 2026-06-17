'use client'

import { Suspense, useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signUp } from '@/lib/auth/actions'
import { GoogleOAuthButton } from '@/components/auth/GoogleOAuthButton'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupFormView next="" emailDefault="" state={{}} loginHref="/login" />}>
      <SignupFormConnected />
    </Suspense>
  )
}

function SignupFormConnected() {
  const params = useSearchParams()
  const rawNext = params.get('next') ?? ''
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : ''
  const emailDefault = params.get('email') ?? ''
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login'
  const [state, formAction] = useActionState(signUp, {})
  return <SignupFormView next={next} emailDefault={emailDefault} state={state} formAction={formAction} loginHref={loginHref} />
}

function SignupFormView({
  next,
  emailDefault,
  state,
  formAction,
  loginHref,
}: {
  next: string
  emailDefault: string
  state: { error?: string; success?: string }
  formAction?: (formData: FormData) => void
  loginHref: string
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
        <h1 className="text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>Create your account</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--pz-muted)' }}>
          Prezva is currently invite-only. Enter your invite code to get started.
        </p>
      </div>

      <GoogleOAuthButton mode="signup" />

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
        <Field label="Invite code" htmlFor="invite_code" required>
          <input
            id="invite_code" name="invite_code" type="text" required
            placeholder="PREZVA-XXXX-XXXX"
            autoCapitalize="characters"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pz-teal)] font-mono tracking-widest"
            style={{
              background: 'var(--pz-surface-2)',
              border: '1px solid var(--pz-border)',
              color: 'var(--pz-text)',
            }}
          />
        </Field>
        <Field label="Full name" htmlFor="full_name">
          <input
            id="full_name" name="full_name" type="text" required autoComplete="name"
            placeholder="Jane Smith"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pz-teal)]"
            style={{
              background: 'var(--pz-surface-2)',
              border: '1px solid var(--pz-border)',
              color: 'var(--pz-text)',
            }}
          />
        </Field>
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
        <Field label="Password" htmlFor="password">
          <input
            id="password" name="password" type="password" required autoComplete="new-password" minLength={8}
            placeholder="Min. 8 characters"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pz-teal)]"
            style={{
              background: 'var(--pz-surface-2)',
              border: '1px solid var(--pz-border)',
              color: 'var(--pz-text)',
            }}
          />
        </Field>
        <Button type="submit" className="w-full">Create account</Button>
      </form>

      <p className="mt-6 text-center text-sm" style={{ color: 'var(--pz-muted)' }}>
        Already have an account?{' '}
        <Link href={loginHref} className="font-medium hover:underline" style={{ color: 'var(--pz-teal-ink)' }}>
          Sign in
        </Link>
      </p>
      <p className="mt-3 text-center text-xs" style={{ color: 'var(--pz-muted)' }}>
        Don&apos;t have an invite code?{' '}
        <a href="https://prezva.app#waitlist" className="hover:underline" style={{ color: 'var(--pz-muted)' }}>
          Join the waitlist
        </a>
      </p>
    </div>
  )
}

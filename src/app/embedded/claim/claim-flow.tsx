'use client'

import { useState } from 'react'
import {
  claimSignIn,
  claimSignUp,
  getClaimOrgs,
  claimLocation,
  type ClaimOrgOption,
  type OrgChoice,
} from '@/lib/embedded/claim-actions'

type Step = 'choose' | 'signin' | 'signup' | 'confirm_email' | 'org' | 'submitting' | 'error'

const inputCls = [
  'w-full rounded-lg border px-3 py-2 text-sm transition-colors',
  'focus:outline-none focus:ring-1',
].join(' ')

const inputStyle = {
  borderColor: 'var(--pz-border)',
  background: 'var(--pz-surface)',
  color: 'var(--pz-text)',
}

const CLAIM_ERROR_COPY: Record<string, string> = {
  session_expired: 'Your session expired. Please sign in again.',
  forbidden: "You don't have settings access on that organization.",
  install_missing: "We couldn't find an install for this location. Please reinstall the app from the GoHighLevel marketplace.",
}

function claimErrorMessage(error: string): string {
  return CLAIM_ERROR_COPY[error] ?? error
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold" style={{ color: 'var(--pz-text)' }}>{label}</label>
      {children}
    </div>
  )
}

export function ClaimFlow() {
  const [step, setStep] = useState<Step>('choose')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [claimToken, setClaimToken] = useState<string | null>(null)
  const [orgs, setOrgs] = useState<ClaimOrgOption[] | null>(null)
  const [orgMode, setOrgMode] = useState<'pick' | 'create'>('create')
  const [selectedOrgId, setSelectedOrgId] = useState<string>('')
  const [newOrgName, setNewOrgName] = useState('')

  async function loadOrgs(token: string) {
    const result = await getClaimOrgs(token)
    if ('error' in result) {
      setError(claimErrorMessage(result.error))
      setStep('error')
      return
    }
    setOrgs(result.orgs)
    setOrgMode(result.orgs.length > 0 ? 'pick' : 'create')
    if (result.orgs.length > 0) setSelectedOrgId(result.orgs[0].id)
    setStep('org')
  }

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const result = await claimSignIn(new FormData(e.currentTarget))
    setPending(false)
    if ('error' in result) { setError(result.error); return }
    if ('confirmEmail' in result) { setStep('confirm_email'); return }
    setClaimToken(result.claimToken)
    await loadOrgs(result.claimToken)
  }

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const result = await claimSignUp(new FormData(e.currentTarget))
    setPending(false)
    if ('error' in result) { setError(result.error); return }
    if ('confirmEmail' in result) { setStep('confirm_email'); return }
    setClaimToken(result.claimToken)
    await loadOrgs(result.claimToken)
  }

  async function handleClaim() {
    if (!claimToken) return
    setError(null)

    const orgChoice: OrgChoice = orgMode === 'pick'
      ? { type: 'existing', orgId: selectedOrgId }
      : { type: 'new', name: newOrgName }

    if (orgChoice.type === 'new' && orgChoice.name.trim().length < 2) {
      setError('Please enter an organization name.')
      return
    }

    setStep('submitting')
    const result = await claimLocation(claimToken, orgChoice)
    if ('error' in result) {
      setError(claimErrorMessage(result.error))
      setStep('org')
      return
    }
    window.location.assign(result.next)
  }

  if (step === 'choose') {
    return (
      <div className="flex flex-col gap-4 rounded-xl border p-6" style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}>
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--pz-text)' }}>Connect this location to Prezva</h1>
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>Sign in or create a Prezva account to finish setup.</p>
        </div>
        <button
          onClick={() => setStep('signin')}
          className="rounded-lg py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent, #fff)' }}
        >
          Sign in
        </button>
        <button
          onClick={() => setStep('signup')}
          className="rounded-lg py-2.5 text-sm font-semibold"
          style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
        >
          Create account
        </button>
      </div>
    )
  }

  if (step === 'signin' || step === 'signup') {
    const isSignUp = step === 'signup'
    return (
      <form
        onSubmit={isSignUp ? handleSignUp : handleSignIn}
        className="flex flex-col gap-4 rounded-xl border p-6"
        style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}
      >
        <h1 className="text-lg font-semibold" style={{ color: 'var(--pz-text)' }}>
          {isSignUp ? 'Create your account' : 'Sign in'}
        </h1>
        {isSignUp && (
          <Field label="Full name">
            <input name="full_name" required autoComplete="name" className={inputCls} style={inputStyle} />
          </Field>
        )}
        <Field label="Email">
          <input name="email" type="email" required autoComplete="email" className={inputCls} style={inputStyle} />
        </Field>
        <Field label="Password">
          <input
            name="password" type="password" required minLength={isSignUp ? 8 : undefined}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            className={inputCls} style={inputStyle}
          />
        </Field>
        {error && <p className="text-sm" style={{ color: 'var(--pz-error, #dc2626)' }}>{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent, #fff)' }}
        >
          {pending ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
        </button>
        <button
          type="button"
          onClick={() => { setError(null); setStep(isSignUp ? 'signin' : 'signup') }}
          className="text-xs font-medium hover:underline"
          style={{ color: 'var(--pz-muted)' }}
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
        </button>
      </form>
    )
  }

  if (step === 'confirm_email') {
    return (
      <div className="flex flex-col gap-3 rounded-xl border p-6 text-center" style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>Check your email to confirm your account.</p>
        <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>Then come back here and sign in.</p>
        <button
          onClick={() => setStep('signin')}
          className="mt-2 rounded-lg py-2 text-sm font-semibold"
          style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
        >
          Back to sign in
        </button>
      </div>
    )
  }

  if (step === 'org' || step === 'submitting') {
    return (
      <div className="flex flex-col gap-4 rounded-xl border p-6" style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--pz-text)' }}>Choose an organization</h1>

        {orgs && orgs.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--pz-text)' }}>
              <input type="radio" checked={orgMode === 'pick'} onChange={() => setOrgMode('pick')} />
              Use an existing organization
            </label>
            {orgMode === 'pick' && (
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className={inputCls}
                style={inputStyle}
              >
                {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            )}
            <label className="mt-1 flex items-center gap-2 text-sm" style={{ color: 'var(--pz-text)' }}>
              <input type="radio" checked={orgMode === 'create'} onChange={() => setOrgMode('create')} />
              Create a new organization
            </label>
          </div>
        )}

        {orgMode === 'create' && (
          <Field label="Organization name">
            <input
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="Acme Events"
              className={inputCls}
              style={inputStyle}
            />
          </Field>
        )}

        {error && <p className="text-sm" style={{ color: 'var(--pz-error, #dc2626)' }}>{error}</p>}

        <button
          onClick={handleClaim}
          disabled={step === 'submitting'}
          className="rounded-lg py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent, #fff)' }}
        >
          {step === 'submitting' ? 'Connecting…' : 'Connect location'}
        </button>
      </div>
    )
  }

  // step === 'error'
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-6 text-center" style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}>
      <p className="text-sm font-medium" style={{ color: 'var(--pz-error, #dc2626)' }}>{error}</p>
      <button
        onClick={() => { setError(null); setStep('choose') }}
        className="mt-2 rounded-lg py-2 text-sm font-semibold"
        style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
      >
        Start over
      </button>
    </div>
  )
}

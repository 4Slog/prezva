'use client'

import { useState } from 'react'

interface Factor {
  id: string
  status: 'verified' | 'unverified'
}

interface TwoFactorSetupProps {
  existingFactor: Factor | null
}

const btnBase = 'rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50'
const btnPrimary = `${btnBase} bg-[#2DD4BF] text-[#0D1B2A] hover:bg-[#00D4B8]`
const btnGhost = `${btnBase} text-[#64748B] hover:text-[#F0F4F8]`
const btnDestructive = `${btnBase} bg-red-900/40 text-red-400 hover:bg-red-900/60`

export function TwoFactorSetup({ existingFactor }: TwoFactorSetupProps) {
  const [step, setStep] = useState<'idle' | 'enrolling' | 'done'>('idle')
  const [factorId, setFactorId] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function startEnroll() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/mfa/enroll', { method: 'POST' })
    const data = await res.json()
    if (data.error) { setError(data.error); setLoading(false); return }
    setFactorId(data.factorId)
    setQrCode(data.qrCode)
    setSecret(data.secret)
    setStep('enrolling')
    setLoading(false)
  }

  async function verify() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/mfa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factorId, code }),
    })
    const data = await res.json()
    if (data.error) { setError(data.error); setLoading(false); return }
    setStep('done')
    setLoading(false)
  }

  async function unenroll() {
    if (!existingFactor) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/mfa/unenroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factorId: existingFactor.id }),
    })
    const data = await res.json()
    if (data.error) { setError(data.error); setLoading(false); return }
    window.location.reload()
  }

  if (existingFactor?.status === 'verified') {
    return (
      <div className="rounded-lg border border-[#1E3A5F] p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#2DD4BF]" />
          <p className="text-sm font-semibold text-[#F0F4F8]">Two-factor authentication is enabled</p>
        </div>
        <p className="text-xs text-[#94A3B8]">Your account is protected with an authenticator app.</p>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button className={btnDestructive} onClick={unenroll} disabled={loading}>
          {loading ? 'Removing…' : 'Remove 2FA'}
        </button>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="rounded-lg border border-[#2DD4BF]/30 p-6">
        <p className="text-sm font-semibold text-[#2DD4BF]">2FA enabled successfully!</p>
        <p className="text-xs text-[#94A3B8] mt-1">Your account is now protected with your authenticator app.</p>
      </div>
    )
  }

  if (step === 'enrolling') {
    return (
      <div className="rounded-lg border border-[#1E3A5F] p-6 space-y-5">
        <p className="text-sm font-semibold text-[#F0F4F8]">Scan this QR code with your authenticator app</p>
        <img src={qrCode} alt="2FA QR code" className="w-40 h-40 rounded-lg bg-white p-2" />
        <p className="text-xs text-[#64748B]">Can&apos;t scan? Enter this secret manually: <code className="text-[#2DD4BF]">{secret}</code></p>
        <div className="space-y-2">
          <p className="text-xs text-[#94A3B8]">Enter the 6-digit code from your authenticator app</p>
          <input
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            maxLength={6}
            className="w-32 text-center tracking-widest font-mono bg-[#0D1B2A] border border-[#1E3A5F] rounded-lg px-3 py-2 text-sm text-[#F0F4F8] focus:outline-none focus:border-[#2DD4BF]"
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-3">
          <button className={btnPrimary} onClick={verify} disabled={loading || code.length !== 6}>
            {loading ? 'Verifying…' : 'Verify & Enable'}
          </button>
          <button className={btnGhost} onClick={() => setStep('idle')} disabled={loading}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[#1E3A5F] p-6 space-y-4">
      <p className="text-sm font-semibold text-[#F0F4F8]">Two-factor authentication</p>
      <p className="text-xs text-[#94A3B8]">Add an extra layer of security using an authenticator app (Google Authenticator, Authy, 1Password, etc.)</p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button className={btnPrimary} onClick={startEnroll} disabled={loading}>
        {loading ? 'Setting up…' : 'Enable 2FA'}
      </button>
    </div>
  )
}

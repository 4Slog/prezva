'use client'

import { useState, useEffect } from 'react'
import { createLoginLink } from '@/lib/connect/actions'

interface ConnectStatus {
  connected:        boolean
  status:           'not_connected' | 'pending' | 'restricted' | 'active'
  chargesEnabled?:  boolean
  payoutsEnabled?:  boolean
  detailsSubmitted?: boolean
  requirementsCount?: number
}

interface ConnectBankButtonProps {
  orgId:   string
  orgSlug: string
  initialStatus?: ConnectStatus
}

const STATUS_CONFIG = {
  not_connected: {
    label:  'Connect bank account',
    detail: 'Connect your bank account to enable paid ticket sales',
    dot:    'pz-dot-warning',
    text:   'text-[#F59E0B]',
  },
  pending: {
    label:  'Finish setup',
    detail: 'Complete your Stripe onboarding to accept payments',
    dot:    'pz-dot-warning',
    text:   'text-[#F59E0B]',
  },
  restricted: {
    label:  'Action required',
    detail: 'Your account has restrictions — review required',
    dot:    'pz-dot-offline',
    text:   'text-[#EF4444]',
  },
  active: {
    label:  'Payouts active',
    detail: 'Ticket payments go directly to your bank',
    dot:    'pz-dot-online',
    text:   'text-[#22C55E]',
  },
}

export function ConnectBankButton({ orgId, initialStatus }: ConnectBankButtonProps) {
  const [status, setStatus] = useState<ConnectStatus>(
    initialStatus ?? { connected: false, status: 'not_connected' }
  )
  const [pending, setPending] = useState(false)

  useEffect(() => {
    fetch(`/api/connect/status?org_id=${orgId}`)
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() => {})
  }, [orgId])

  const cfg = STATUS_CONFIG[status.status]

  async function handleConnect() {
    setPending(true)
    window.location.href = `/api/connect/onboard?org_id=${orgId}`
  }

  async function handleDashboard() {
    setPending(true)
    const result = await createLoginLink(orgId)
    setPending(false)
    if ('url' in result) window.open(result.url, '_blank')
  }

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={`mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${cfg.dot}`} />
          <div>
            <p className="font-semibold text-[#F0F4F8] text-sm">Stripe Payouts</p>
            <p className={`text-xs mt-0.5 ${cfg.text}`}>{cfg.detail}</p>
            {status.status === 'active' && (
              <p className="text-xs text-[#64748B] mt-1">
                Attendee payments go directly to your bank account — Prezva never touches the money.
              </p>
            )}
            {!!status.requirementsCount && (
              <p className="text-xs text-[#F59E0B] mt-1">
                {status.requirementsCount} requirement{status.requirementsCount > 1 ? 's' : ''} pending
              </p>
            )}
          </div>
        </div>

        <div className="flex-shrink-0">
          {status.status === 'active' ? (
            <button
              onClick={handleDashboard}
              disabled={pending}
              className="rounded-lg border border-[#1E3A5F] px-3 py-1.5 text-xs font-medium text-[#94A3B8] hover:text-[#F0F4F8] hover:border-[#00BFA6]/40 transition-colors disabled:opacity-50"
            >
              {pending ? '…' : 'Stripe dashboard ↗'}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={pending}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 transition-opacity"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              {pending ? 'Redirecting…' : cfg.label}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

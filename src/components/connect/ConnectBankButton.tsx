'use client'

import { useState, useEffect } from 'react'
import { createLoginLink } from '@/lib/connect/actions'

interface ConnectStatus {
  connected:                  boolean
  status:                     'not_connected' | 'pending' | 'restricted' | 'active'
  chargesEnabled?:            boolean
  payoutsEnabled?:            boolean
  detailsSubmitted?:          boolean
  requirementsCount?:         number
  requirementsDue?:           string[]
  requirementsEventuallyDue?: string[]
  disabledReason?:            string | null
}

interface ConnectBankButtonProps {
  orgId:         string
  orgSlug:       string
  initialStatus?: ConnectStatus
}

const STATUS_CONFIG = {
  not_connected: {
    label:  'Connect Stripe account',
    detail: 'Connect your Stripe account to enable paid ticket sales',
    dot:    'pz-dot-warning',
    text:   'text-[var(--pz-warning-fill)]',
  },
  pending: {
    label:  'Finish setup',
    detail: 'Complete your Stripe onboarding to accept payments',
    dot:    'pz-dot-warning',
    text:   'text-[var(--pz-warning-fill)]',
  },
  restricted: {
    label:  'Action required',
    detail: 'Your account has restrictions — review required',
    dot:    'pz-dot-offline',
    text:   'text-[var(--pz-error)]',
  },
  active: {
    label:  'Payouts active',
    detail: 'Ticket payments go directly to your Stripe account',
    dot:    'pz-dot-online',
    text:   'text-[var(--pz-success-fill)]',
  },
}

const REQUIREMENT_LABELS: Record<string, string> = {
  'individual.dob.day':                   'Date of birth',
  'individual.dob.month':                 'Date of birth',
  'individual.dob.year':                  'Date of birth',
  'individual.ssn_last_4':               'Last 4 digits of SSN',
  'individual.verification.document':    'Identity document (ID or passport)',
  'business_profile.url':                'Business website URL',
  'business_profile.mcc':                'Business category',
  'tos_acceptance.date':                 'Terms of Service acceptance',
  'tos_acceptance.ip':                   'Terms of Service acceptance',
  'external_account':                    'Bank account for payouts',
  'individual.address.line1':            'Business address',
  'individual.address.city':             'Business city',
  'individual.address.state':            'Business state',
  'individual.address.postal_code':      'Business zip code',
  'individual.first_name':               'Legal first name',
  'individual.last_name':                'Legal last name',
  'individual.email':                    'Email address',
  'individual.phone':                    'Phone number',
}

function humanizeRequirement(key: string): string {
  return REQUIREMENT_LABELS[key] ?? key.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function deduplicateRequirements(keys: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const key of keys) {
    const label = humanizeRequirement(key)
    if (!seen.has(label)) {
      seen.add(label)
      result.push(label)
    }
  }
  return result
}

export function ConnectBankButton({ orgId, initialStatus }: ConnectBankButtonProps) {
  const [status, setStatus] = useState<ConnectStatus>(
    initialStatus ?? { connected: false, status: 'not_connected' }
  )
  const [pending, setPending]   = useState(false)
  const [reqOpen, setReqOpen]   = useState(false)
  const [linkPending, setLinkPending] = useState(false)

  useEffect(() => {
    fetch(`/api/connect/status?org_id=${orgId}`)
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() => {})
  }, [orgId])

  const cfg = STATUS_CONFIG[status.status]
  const requirementsDue = status.requirementsDue ?? []
  const dedupedLabels   = deduplicateRequirements(requirementsDue)

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

  async function handleCompleteInStripe() {
    setLinkPending(true)
    window.location.href = `/api/connect/onboard?org_id=${orgId}`
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
            <p className="font-semibold text-[var(--pz-text)] text-sm">Stripe Payments</p>
            <p className={`text-xs mt-0.5 ${cfg.text}`}>{cfg.detail}</p>
            {status.status === 'active' && (
              <p className="text-xs text-[var(--pz-muted)] mt-1">
                Attendee payments go directly to your Stripe account — Prezva never touches the money.
              </p>
            )}
            {requirementsDue.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-[var(--pz-warning-fill)]">
                  {requirementsDue.length} requirement{requirementsDue.length > 1 ? 's' : ''} pending
                </p>
                <button
                  onClick={() => setReqOpen((o) => !o)}
                  className="mt-1 text-xs text-[var(--pz-muted)] hover:text-[var(--pz-text)] transition-colors"
                >
                  {reqOpen ? '▾' : '▸'} What&apos;s needed ({dedupedLabels.length})
                </button>
                {reqOpen && (
                  <div className="mt-2 space-y-1">
                    {dedupedLabels.map((label) => (
                      <div key={label} className="flex items-center gap-1.5 text-xs text-[var(--pz-muted)]">
                        <span className="h-1 w-1 rounded-full bg-[var(--pz-muted)] flex-shrink-0" />
                        {label}
                      </div>
                    ))}
                    <button
                      onClick={handleCompleteInStripe}
                      disabled={linkPending}
                      // eslint-disable-next-line no-restricted-syntax
                      className="mt-2 text-xs font-medium text-[var(--pz-teal-ink)] hover:text-[#00DDB8] transition-colors disabled:opacity-50"
                    >
                      {linkPending ? 'Redirecting…' : 'Complete in Stripe →'}
                    </button>
                  </div>
                )}
              </div>
            )}
            {!!status.requirementsCount && requirementsDue.length === 0 && (
              <p className="text-xs text-[var(--pz-warning-fill)] mt-1">
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
              className="rounded-lg border border-[var(--pz-border)] px-3 py-1.5 text-xs font-medium text-[var(--pz-muted)] hover:text-[var(--pz-text)] hover:border-[var(--pz-teal)]/40 transition-colors disabled:opacity-50"
            >
              {pending ? '…' : 'Stripe dashboard ↗'}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={pending}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 transition-opacity"
              style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
            >
              {pending ? 'Redirecting…' : cfg.label}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

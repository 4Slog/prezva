'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface OrgMembership {
  role: string
  organizations: {
    id: string
    name: string
    slug: string
    logo_url: string | null
  } | null
}

interface OrgSwitcherProps {
  orgs: OrgMembership[]
  currentSlug?: string
}

export function OrgSwitcher({ orgs, currentSlug }: OrgSwitcherProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const current = orgs.find((m) => m.organizations?.slug === currentSlug)
    ?? (orgs.length === 1 ? orgs[0] : null)
  const display = current?.organizations?.name ?? 'Select organization'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
        style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
      >
        <span className="flex-1 truncate text-left">{display}</span>
        <svg className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--pz-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 z-20 mt-1 w-56 rounded-md shadow-lg"
          style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)' }}
        >
          <div className="p-1">
            {orgs.map((m) => {
              const org = m.organizations
              if (!org) return null
              const isActive = org.slug === currentSlug
              return (
                <button
                  key={org.id}
                  onClick={() => {
                    setOpen(false)
                    router.push(`/orgs/${org.slug}/settings`)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left"
                  style={{
                    background: isActive ? 'rgba(0,191,166,0.1)' : 'transparent',
                    color: isActive ? 'var(--pz-teal)' : 'var(--pz-text)',
                  }}
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold uppercase"
                    style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-teal)' }}
                  >
                    {org.name[0]}
                  </span>
                  <span className="flex-1 truncate">{org.name}</span>
                </button>
              )
            })}
          </div>
          <div className="p-1" style={{ borderTop: '1px solid var(--pz-border)' }}>
            <Link
              href="/orgs/new"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm"
              style={{ color: 'var(--pz-muted)' }}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New organization
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

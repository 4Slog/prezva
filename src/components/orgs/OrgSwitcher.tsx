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
  const display = current?.organizations?.name ?? 'Select organization'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
      >
        <span className="max-w-[160px] truncate">{display}</span>
        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1 w-56 rounded-md border border-gray-100 bg-white shadow-lg">
          <div className="p-1">
            {orgs.map((m) => {
              const org = m.organizations
              if (!org) return null
              return (
                <button
                  key={org.id}
                  onClick={() => {
                    setOpen(false)
                    router.push(`/dashboard`)
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                    org.slug === currentSlug ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700'
                  }`}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-gray-200 text-xs font-bold uppercase">
                    {org.name[0]}
                  </span>
                  <span className="flex-1 truncate">{org.name}</span>
                </button>
              )
            })}
          </div>
          <div className="border-t border-gray-100 p-1">
            <Link
              href="/orgs/new"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
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

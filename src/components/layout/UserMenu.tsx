'use client'

import { useState, useRef, useEffect } from 'react'
import { signOut } from '@/lib/auth/actions'

interface UserMenuProps {
  email: string
}

export function UserMenu({ email }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const initial = (email ?? 'U')[0].toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        aria-label="User menu"
      >
        {initial}
      </button>

      {open && (
        <div
          className="absolute right-0 top-10 z-50 w-52 rounded-xl py-1 shadow-xl"
          style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)' }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--pz-border)' }}>
            <p className="text-xs font-medium truncate" style={{ color: 'var(--pz-muted)' }}>
              {email}
            </p>
          </div>

          <form action={signOut}>
            <button
              type="submit"
              className="w-full px-4 py-2.5 text-left text-sm font-medium transition-colors hover:bg-white/5"
              style={{ color: 'var(--pz-error)' }}
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

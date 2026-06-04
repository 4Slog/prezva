"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { signOut } from "@/lib/auth/actions"

interface UserMenuProps {
  email: string
  name?: string | null
}

export function UserMenu({ email, name }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const initial = (name ?? email ?? "U").trim().charAt(0).toUpperCase()

  // Close on outside click + Escape
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick)
      document.addEventListener("keydown", onKey)
      return () => {
        document.removeEventListener("mousedown", onDocClick)
        document.removeEventListener("keydown", onKey)
      }
    }
  }, [open])

  async function handleSignOut() {
    setPending(true)
    try {
      await signOut()
    } catch {
      setPending(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="User menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2"
        style={{
          background: "var(--pz-teal)",
          color: "var(--pz-on-accent)",
        }}
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-50 w-60 rounded-lg shadow-lg"
          style={{
            background: "var(--pz-surface)",
            border: "1px solid var(--pz-border)",
          }}
        >
          {/* Identity block */}
          <div
            className="px-4 py-3"
            style={{ borderBottom: "1px solid var(--pz-border)" }}
          >
            {name && (
              <div
                className="text-sm font-semibold truncate"
                style={{ color: "var(--pz-text)" }}
              >
                {name}
              </div>
            )}
            <div
              className="text-xs truncate"
              style={{ color: "var(--pz-muted)" }}
              title={email}
            >
              {email}
            </div>
          </div>

          {/* Links */}
          <div className="py-1">
            <Link
              href="/settings/security"
              role="menuitem"
              className="block px-4 py-2 text-sm transition-colors hover:bg-[var(--pz-surface-2)]"
              style={{ color: "var(--pz-text)" }}
              onClick={() => setOpen(false)}
            >
              Security &amp; 2FA
            </Link>
            <Link
              href="/help"
              role="menuitem"
              className="block px-4 py-2 text-sm transition-colors hover:bg-[var(--pz-surface-2)]"
              style={{ color: "var(--pz-text)" }}
              onClick={() => setOpen(false)}
            >
              Help Center
            </Link>
          </div>

          {/* Sign out */}
          <div
            className="py-1"
            style={{ borderTop: "1px solid var(--pz-border)" }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={pending}
              className="block w-full text-left px-4 py-2 text-sm transition-colors hover:bg-[var(--pz-surface-2)] disabled:opacity-50"
              style={{ color: "var(--pz-text)" }}
            >
              {pending ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

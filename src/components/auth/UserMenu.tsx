"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { signOut } from "@/lib/auth/actions"
import { countPendingEverywhere, deleteAllScanDbs } from "@/lib/checkin/session-offline-db"

interface UserMenuProps {
  email: string
  name?: string | null
  avatarUrl?: string | null
}

export function UserMenu({ email, name, avatarUrl }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  // Unsynced offline session check-ins found at sign-out (M3b): ask first.
  const [unsyncedWarning, setUnsyncedWarning] = useState<number | null>(null)
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

  async function handleSignOut(confirmed = false) {
    setPending(true)
    try {
      // This browser's offline scan stores belong to whoever is signed in:
      // they go with the session. Unsynced check-ins are warned about first.
      if (!confirmed) {
        const unsynced = await countPendingEverywhere().catch(() => 0)
        if (unsynced > 0) {
          setUnsyncedWarning(unsynced)
          setPending(false)
          return
        }
      }
      await deleteAllScanDbs().catch(e => console.error("[sign-out] offline stores not cleared:", e))
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
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-sm font-semibold transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2"
        style={{
          background: avatarUrl ? "var(--pz-surface-2)" : "var(--pz-teal)",
          color: "var(--pz-on-accent)",
        }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
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
            {unsyncedWarning !== null ? (
              <div role="alert" className="px-4 py-2 space-y-2">
                <p className="text-xs" style={{ color: "var(--pz-text)" }}>
                  {unsyncedWarning} check-in{unsyncedWarning === 1 ? " has" : "s have"} not synced; signing out will discard them
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setUnsyncedWarning(null); void handleSignOut(true) }}
                    disabled={pending}
                    className="px-2 py-1 rounded text-xs font-semibold bg-red-600 text-white disabled:opacity-50"
                  >
                    Sign out anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnsyncedWarning(null)}
                    className="px-2 py-1 rounded text-xs underline"
                    style={{ color: "var(--pz-text)" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => void handleSignOut()}
                disabled={pending}
                className="block w-full text-left px-4 py-2 text-sm transition-colors hover:bg-[var(--pz-surface-2)] disabled:opacity-50"
                style={{ color: "var(--pz-text)" }}
              >
                {pending ? "Signing out..." : "Sign out"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

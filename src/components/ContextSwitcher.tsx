'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { SwitcherContextItem } from '@/lib/auth/get-contexts'

interface ContextSwitcherProps {
  currentContext: string // 'personal' or org slug
  contexts: SwitcherContextItem[]
}

export function ContextSwitcher({ currentContext, contexts }: ContextSwitcherProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', onDocClick)
      document.addEventListener('keydown', onKey)
      return () => {
        document.removeEventListener('mousedown', onDocClick)
        document.removeEventListener('keydown', onKey)
      }
    }
  }, [open])

  // Find active context (default to first org or personal)
  const active =
    contexts.find((c) => c.id === currentContext) ??
    contexts.find((c) => c.type === 'personal') ??
    contexts[0]

  if (!active) return null

  // Personal always at the bottom; orgs above
  const orgs = contexts.filter((c) => c.type === 'org')
  const personal = contexts.find((c) => c.type === 'personal')

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Switch context. Current: ${active.label}`}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          height: 32,
          padding: '0 12px',
          borderRadius: 999,
          border: '1px solid var(--pz-border)',
          background: 'var(--pz-surface)',
          color: 'var(--pz-text)',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          maxWidth: 240,
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: active.color,
            flexShrink: 0,
          }}
        />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {active.label}
        </span>
        <span aria-hidden style={{ opacity: 0.6, fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            minWidth: 280,
            maxWidth: 320,
            zIndex: 50,
            background: 'var(--pz-surface)',
            border: '1px solid var(--pz-border)',
            borderRadius: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
        >
          {orgs.length > 0 && (
            <div style={{ padding: '6px 0' }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  color: 'var(--pz-muted)',
                  padding: '6px 14px',
                }}
              >
                Organizations
              </div>
              {orgs.map((c) => (
                <ContextRow key={c.id} item={c} active={c.id === active.id} onSelect={() => setOpen(false)} />
              ))}
            </div>
          )}
          {personal && (
            <>
              {orgs.length > 0 && <div style={{ borderTop: '1px solid var(--pz-border)' }} />}
              <div style={{ padding: '6px 0' }}>
                <ContextRow item={personal} active={personal.id === active.id} onSelect={() => setOpen(false)} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ContextRow({
  item,
  active,
  onSelect,
}: {
  item: SwitcherContextItem
  active: boolean
  onSelect: () => void
}) {
  return (
    <Link
      role="menuitem"
      href={item.href}
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        textDecoration: 'none',
        color: 'var(--pz-text)',
        background: active ? 'var(--pz-surface-2)' : 'transparent',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: item.color,
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.label}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 11,
            color: 'var(--pz-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.sublabel}
        </span>
      </span>
      {item.role && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            color: item.color,
            background: item.color + '22',
            padding: '2px 6px',
            borderRadius: 4,
          }}
        >
          {item.sublabel}
        </span>
      )}
    </Link>
  )
}

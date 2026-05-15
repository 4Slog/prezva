'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { SyncHealthPill } from '@/components/layout/SyncHealthPill'

interface OrgMembership {
  role: string
  organizations: { id: string; name: string; slug: string; logo_url: string | null } | null
}

interface SidebarProps {
  orgs: OrgMembership[]
  defaultOrgSlug?: string | null
}

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { href: '/events',    label: 'Events',    icon: '📅' },
]

const NAV_BOTTOM = [
  { href: '/help', label: 'Help', icon: '❓' },
]

export function Sidebar({ orgs, defaultOrgSlug }: SidebarProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-collapsed') === 'true' || window.innerWidth < 768
  })
  const pathname = usePathname()

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar-collapsed', String(next))
  }

  // Detect current org slug from URL (/orgs/{slug}/...) or fall back to default
  const orgMatch = pathname.match(/^\/orgs\/([^/]+)/)
  const currentOrgSlug =
    orgMatch?.[1] ??
    defaultOrgSlug ??
    orgs[0]?.organizations?.slug ??
    ''

  const NAV_ORG = [
    { href: `/orgs/${currentOrgSlug}`,              label: 'My Org',       icon: '🏢' },
    { href: `/orgs/${currentOrgSlug}/settings`,     label: 'Settings',     icon: '⚙️' },
    { href: `/orgs/${currentOrgSlug}/templates`,    label: 'Templates',    icon: '📐' },
    { href: `/orgs/${currentOrgSlug}/integrations`, label: 'Integrations', icon: '🔌' },
    { href: `/orgs/${currentOrgSlug}/audit-log`,    label: 'Audit Log',    icon: '🔍' },
  ]

  const width = collapsed ? 48 : 220

  const linkStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 10px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    background: active ? 'rgba(45,212,191,0.15)' : 'transparent',
    color: active ? 'var(--pz-teal)' : 'var(--pz-text)',
    marginBottom: 2,
  })

  return (
    <aside
      style={{
        width,
        minWidth: width,
        transition: 'width 200ms ease, min-width 200ms ease',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--pz-surface)',
        borderRight: '1px solid var(--pz-border)',
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '20px 12px 12px', flexShrink: 0 }}>
        {collapsed ? (
          <Image src="/logo-mark.svg" alt="Prezva" width={32} height={27} style={{ flexShrink: 0 }} />
        ) : (
          <Image src="/logo.svg" alt="Prezva" width={148} height={28} style={{ flexShrink: 0 }} />
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0 8px', overflowY: 'auto', overflowX: 'hidden' }}>
        {NAV.map((item) => {
          const active = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              style={linkStyle(active)}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          )
        })}

        <div style={{
          padding: collapsed ? '8px 0 4px' : '8px 10px 4px',
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: '#475569',
          textAlign: collapsed ? 'center' : 'left',
        }}>
          {collapsed ? '·' : 'Organization'}
        </div>

        {NAV_ORG.map((item) => {
          const active = pathname === item.href ||
            pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.label}
              href={item.href}
              title={collapsed ? item.label : undefined}
              style={linkStyle(active)}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom: help + sync health + toggle */}
      <div style={{ padding: '0 8px 8px', flexShrink: 0 }}>
        {NAV_BOTTOM.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            style={linkStyle(false)}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
            {!collapsed && item.label}
          </Link>
        ))}

        {!collapsed && (
          <div style={{ padding: '4px 0 8px' }}>
            <SyncHealthPill />
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 8,
            width: '100%',
            padding: '8px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            background: 'transparent',
            border: 'none',
            color: 'var(--pz-muted)',
            fontSize: 13,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{
            fontSize: 16, flexShrink: 0,
            display: 'inline-block',
            transition: 'transform 200ms',
            transform: collapsed ? 'rotate(180deg)' : 'none',
          }}>
            ‹
          </span>
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  )
}

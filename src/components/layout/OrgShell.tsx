'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Building2,
  Calendar,
  ChevronLeft,
  HelpCircle,
  LayoutDashboard,
  LayoutTemplate,
  Mic,
  Plug,
  ScrollText,
  Settings,
} from 'lucide-react'
import { SideNav } from '@/components/ui/SideNav'
import type { SideNavGroup, SideNavItem } from '@/components/ui/SideNav'

interface OrgShellProps {
  defaultOrgSlug: string | null
}

export function OrgShell({ defaultOrgSlug }: OrgShellProps) {
  const slug = defaultOrgSlug ?? ''

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-collapsed') === 'true' || window.innerWidth < 768
  })

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar-collapsed', String(next))
  }

  const pinnedTop: SideNavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Events',    href: '/events',    icon: Calendar },
  ]

  const groups: SideNavGroup[] = [
    {
      id: 'org',
      label: 'Organization',
      icon: Building2,
      items: [
        { label: 'My Org',          href: `/orgs/${slug}`,              icon: Building2 },
        { label: 'Settings',        href: `/orgs/${slug}/settings`,     icon: Settings },
        { label: 'Templates',       href: `/orgs/${slug}/templates`,    icon: LayoutTemplate },
        { label: 'Integrations',    href: `/orgs/${slug}/integrations`, icon: Plug },
        { label: 'Audit Log',       href: `/orgs/${slug}/audit-log`,    icon: ScrollText },
        { label: 'Speaker Library', href: `/orgs/${slug}/speakers`,     icon: Mic },
      ],
    },
  ]

  const pinnedBottom: SideNavItem[] = [
    { label: 'Help', href: '/help', icon: HelpCircle },
  ]

  const sidebarWidth = collapsed ? 56 : 224

  return (
    <aside
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--pz-chrome)',
        borderRight: '1px solid var(--pz-chrome-line)',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Logo — links home */}
      <div style={{ padding: '20px 12px 12px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <Link href="/dashboard" aria-label="Home">
          {collapsed ? (
            <Image src="/logo-mark.svg" alt="Prezva" width={32} height={27} style={{ display: 'block' }} />
          ) : (
            <Image src="/logo.svg" alt="Prezva" width={148} height={28} style={{ display: 'block' }} />
          )}
        </Link>
      </div>

      {/* Nav — fills remaining height */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <SideNav
          pinnedTop={pinnedTop}
          groups={groups}
          pinnedBottom={pinnedBottom}
          collapsed={collapsed}
        />
      </div>

      {/* Collapse toggle */}
      <div style={{ padding: '0 8px 12px', flexShrink: 0 }}>
        <button
          type="button"
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
            color: 'var(--pz-chrome-muted)',
            fontSize: 13,
            whiteSpace: 'nowrap',
          }}
        >
          <ChevronLeft
            size={16}
            style={{
              flexShrink: 0,
              transition: 'transform 0.2s ease',
              transform: collapsed ? 'rotate(180deg)' : 'none',
            }}
          />
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  )
}

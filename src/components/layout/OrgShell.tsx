'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  Calendar,
  ChevronLeft,
  CreditCard,
  HelpCircle,
  LayoutDashboard,
  LayoutTemplate,
  Mic,
  Plug,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react'
import { SideNav } from '@/components/ui/SideNav'
import type { SideNavGroup, SideNavItem } from '@/components/ui/SideNav'
import { buildEventNav } from '@/lib/events/event-nav'

interface OrgShellProps {
  defaultOrgSlug: string | null
  canRolesManage?: boolean
}

/** Returns the event slug when the current path is an event page, null otherwise. */
function parseEventSlug(pathname: string): string | null {
  const m = pathname.match(/^\/events\/([^/]+)(?:\/|$)/)
  if (!m) return null
  const slug = m[1]
  if (!slug || slug === 'new') return null
  return slug
}

export function OrgShell({ defaultOrgSlug, canRolesManage = false }: OrgShellProps) {
  const orgSlug = defaultOrgSlug ?? ''
  const pathname = usePathname()
  const eventSlug = parseEventSlug(pathname)

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-collapsed') === 'true' || window.innerWidth < 768
  })

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar-collapsed', String(next))
  }

  // ── Org nav (default) ────────────────────────────────────────────────────
  const orgPinnedTop: SideNavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Events',    href: '/events',    icon: Calendar },
  ]

  const orgGroups: SideNavGroup[] = [
    {
      id: 'org',
      label: 'Organization',
      icon: Building2,
      items: [
        { label: 'Settings',        href: `/orgs/${orgSlug}/settings`,       icon: Settings, exact: true },
        ...(canRolesManage ? [{ label: 'Team & Roles', href: `/orgs/${orgSlug}/settings/roles`, icon: Users }] : []),
        { label: 'Billing',         href: `/orgs/${orgSlug}/billing`,        icon: CreditCard },
        { label: 'Templates',       href: `/orgs/${orgSlug}/templates`,      icon: LayoutTemplate },
        { label: 'Integrations',    href: `/orgs/${orgSlug}/integrations`,   icon: Plug },
        { label: 'Audit Log',       href: `/orgs/${orgSlug}/audit-log`,      icon: ScrollText },
        { label: 'Speaker Library', href: `/orgs/${orgSlug}/speakers`,       icon: Mic },
      ],
    },
  ]

  const orgPinnedBottom: SideNavItem[] = [
    { label: 'Help', href: '/help', icon: HelpCircle },
  ]

  // ── Route-aware nav selection ────────────────────────────────────────────
  const { pinnedTop, groups, pinnedBottom } = eventSlug
    ? buildEventNav(eventSlug)
    : { pinnedTop: orgPinnedTop, groups: orgGroups, pinnedBottom: orgPinnedBottom }

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

      {/* Static 'EVENT' eyebrow when in event mode */}
      {eventSlug && !collapsed && (
        <div style={{ padding: '0 16px 4px', fontSize: 10, fontWeight: 700, color: 'var(--pz-chrome-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Event
        </div>
      )}

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

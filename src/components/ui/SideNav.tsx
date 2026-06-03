'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'

export interface SideNavItem {
  label: string
  href: string
  icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  exact?: boolean
}

export interface SideNavGroup {
  id: string
  label: string
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  items: SideNavItem[]
}

interface SideNavProps {
  groups: SideNavGroup[]
  collapsed?: boolean
  pinnedTop?: SideNavItem[]
  pinnedBottom?: SideNavItem[]
}

function findActiveGroup(groups: SideNavGroup[], pathname: string): string | null {
  return groups.find(g => g.items.some(item => pathname.startsWith(item.href)))?.id ?? null
}

interface PinnedLinkProps {
  item: SideNavItem
  collapsed: boolean
  pathname: string
}

function PinnedLink({ item, collapsed, pathname }: PinnedLinkProps) {
  const isActive = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + '/')
  const ItemIcon = item.icon
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${isActive ? 'pz-nav-active' : 'pz-nav-item'}`}
    >
      {ItemIcon && <ItemIcon size={18} style={{ flexShrink: 0 }} />}
      {!collapsed && item.label}
    </Link>
  )
}

export function SideNav({ groups, collapsed = false, pinnedTop, pinnedBottom }: SideNavProps) {
  const pathname = usePathname()
  const activeGroupId = findActiveGroup(groups, pathname)
  // When on a route inside a group, that group is always open (no setState needed).
  // When off all known routes, the user's last manual toggle controls which group is open.
  const [manualOpenId, setManualOpenId] = useState<string | null>(null)
  const openGroupId = activeGroupId ?? manualOpenId

  const toggle = (id: string) => {
    if (!collapsed) setManualOpenId(prev => (prev === id ? null : id))
  }

  return (
    <nav
      aria-label="Site navigation"
      className="flex flex-col h-full overflow-y-auto py-3"
      style={{
        width: collapsed ? 56 : 224,
        background: 'var(--pz-chrome)',
        borderRight: '1px solid var(--pz-chrome-line)',
        transition: 'width 0.2s ease',
        flexShrink: 0,
      }}
    >
      {pinnedTop && pinnedTop.length > 0 && (
        <>
          {pinnedTop.map(item => (
            <PinnedLink key={item.href} item={item} collapsed={collapsed} pathname={pathname} />
          ))}
          <div aria-hidden style={{ margin: '4px 8px', height: 1, background: 'var(--pz-chrome-line)' }} />
        </>
      )}

      {groups.map(group => {
        const GroupIcon = group.icon
        const isOpen = !collapsed && openGroupId === group.id
        const hasActive = group.items.some(item => pathname.startsWith(item.href))

        return (
          <div key={group.id}>
            <button
              type="button"
              onClick={() => toggle(group.id)}
              aria-expanded={collapsed ? undefined : isOpen}
              title={collapsed ? group.label : undefined}
              className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors hover:opacity-80"
              style={{ color: hasActive ? 'var(--pz-teal)' : 'var(--pz-chrome-muted)' }}
            >
              <GroupIcon size={18} style={{ flexShrink: 0 }} />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left text-sm font-medium">{group.label}</span>
                  <ChevronDown
                    size={14}
                    style={{
                      color: 'var(--pz-chrome-muted)',
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </>
              )}
            </button>

            {isOpen && (
              <div>
                {group.items.map(item => {
                  const isActive = pathname.startsWith(item.href)
                  const ItemIcon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 pl-11 pr-4 py-2 text-sm transition-colors ${isActive ? 'pz-nav-active' : 'pz-nav-item'}`}
                    >
                      {ItemIcon && <ItemIcon size={14} style={{ flexShrink: 0 }} />}
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {pinnedBottom && pinnedBottom.length > 0 && (
        <div className="mt-auto">
          <div aria-hidden style={{ margin: '4px 8px', height: 1, background: 'var(--pz-chrome-line)' }} />
          {pinnedBottom.map(item => (
            <PinnedLink key={item.href} item={item} collapsed={collapsed} pathname={pathname} />
          ))}
        </div>
      )}
    </nav>
  )
}

'use client'

import { usePathname } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import {
  buildEmbedEventNav,
  EmbedOverviewIcon,
  type EmbedNavGroup,
  type EmbedNavItem,
} from '@/lib/embedded/event-nav'

interface Props {
  eventId: string
  ghlLocationId: string
}

function firstBuilt(items: EmbedNavItem[]): EmbedNavItem | undefined {
  return items.find(i => i.built)
}

export function EmbedEventTabs({ eventId, ghlLocationId }: Props) {
  const pathname = usePathname()
  const { overviewHref, groups } = buildEmbedEventNav(eventId, ghlLocationId)

  const isOverview = pathname === overviewHref

  function isGroupActive(group: EmbedNavGroup): boolean {
    return group.items.some(item => item.built && pathname.startsWith(item.href))
  }

  function isItemActive(item: EmbedNavItem): boolean {
    return pathname.startsWith(item.href)
  }

  const activeGroup = groups.find(isGroupActive) ?? null

  return (
    <div>
      {/* Group tab row */}
      <div
        className="flex items-end overflow-x-auto px-4"
        style={{ borderBottom: '1px solid var(--pz-border)' }}
      >
        {/* Overview tab — exact match only */}
        <a
          href={overviewHref}
          className="flex shrink-0 items-center gap-1.5 px-3 pb-2.5 pt-2 text-sm font-medium whitespace-nowrap transition-colors"
          style={{
            color: isOverview ? 'var(--pz-text)' : 'var(--pz-muted)',
            borderBottom: isOverview ? '2px solid var(--pz-teal)' : '2px solid transparent',
            marginBottom: '-1px',
          }}
        >
          <EmbedOverviewIcon size={14} />
          Overview
        </a>

        {/* Group tabs */}
        {groups.map(group => {
          const GroupIcon = group.icon
          const active = isGroupActive(group)
          const firstItem = firstBuilt(group.items)

          if (!firstItem) {
            return (
              <span
                key={group.id}
                className="flex shrink-0 cursor-not-allowed select-none items-center gap-1.5 px-3 pb-2.5 pt-2 text-sm font-medium whitespace-nowrap"
                style={{
                  color: 'var(--pz-muted)',
                  borderBottom: '2px solid transparent',
                  marginBottom: '-1px',
                  opacity: 0.55,
                }}
              >
                <GroupIcon size={14} />
                {group.label}
                <span
                  className="rounded px-1 text-[10px] font-medium leading-4"
                  style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}
                >
                  soon
                </span>
              </span>
            )
          }

          return (
            <a
              key={group.id}
              href={firstItem.href}
              className="flex shrink-0 items-center gap-1.5 px-3 pb-2.5 pt-2 text-sm font-medium whitespace-nowrap transition-colors"
              style={{
                color: active ? 'var(--pz-text)' : 'var(--pz-muted)',
                borderBottom: active ? '2px solid var(--pz-teal)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              <GroupIcon size={14} />
              {group.label}
            </a>
          )
        })}
      </div>

      {/* Sub-row for the active group */}
      {activeGroup && (
        <div
          className="flex items-center overflow-x-auto px-4 py-0.5"
          style={{ background: 'var(--pz-surface-2)', borderBottom: '1px solid var(--pz-border)' }}
        >
          {activeGroup.items.map(item => {
            const ItemIcon = item.icon
            const active = item.built && isItemActive(item)

            if (!item.built) {
              return (
                <span
                  key={item.label}
                  className="flex shrink-0 cursor-not-allowed select-none items-center gap-1 px-3 py-2 text-xs font-medium whitespace-nowrap"
                  style={{ color: 'var(--pz-muted)', opacity: 0.45 }}
                >
                  <ItemIcon size={12} />
                  {item.label}
                  <span
                    className="rounded px-1 text-[9px] font-medium leading-4"
                    style={{ background: 'var(--pz-border)', color: 'var(--pz-muted)' }}
                  >
                    soon
                  </span>
                </span>
              )
            }

            if (item.external) {
              return (
                <a
                  key={item.label}
                  href={item.href}
                  target="_top"
                  title="Manage ticket products in GHL. To sell them, add the product to an order form and connect the Order Submitted workflow."
                  className="flex shrink-0 items-center gap-1 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors"
                  style={{
                    color: active ? 'var(--pz-text)' : 'var(--pz-muted)',
                    borderBottom: active ? '2px solid var(--pz-teal)' : '2px solid transparent',
                  }}
                >
                  <ItemIcon size={12} />
                  {item.label}
                  <ExternalLink size={10} />
                </a>
              )
            }

            return (
              <a
                key={item.label}
                href={item.href}
                className="flex shrink-0 items-center gap-1 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors"
                style={{
                  color: active ? 'var(--pz-text)' : 'var(--pz-muted)',
                  borderBottom: active ? '2px solid var(--pz-teal)' : '2px solid transparent',
                }}
              >
                <ItemIcon size={12} />
                {item.label}
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

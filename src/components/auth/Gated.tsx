'use client'

import React, { type ReactElement, cloneElement, isValidElement } from 'react'
import { PERMISSION_LABELS, PERMISSION_FALLBACK } from '@/lib/auth/permission-labels'

type GatedMode = 'hide' | 'disable'

interface GatedProps {
  /** The permission key to check, e.g. 'volunteers.manage' */
  permission: string
  /** Serialised permission set from the server component (Array.from(permSet)) */
  perms: string[]
  /** 'hide' renders null when not permitted; 'disable' renders child disabled with tooltip */
  mode: GatedMode
  /** Optional tooltip override. Defaults to PERMISSION_LABELS message. */
  tooltip?: string
  children: ReactElement
}

function permits(perms: string[], key: string): boolean {
  return perms.includes('*') || perms.includes(key)
}

/**
 * Gate a single UI control by permission key.
 *
 * Server pattern:
 *   const permSet = await getOrgPermissions(orgId, userId)
 *   const permissions = Array.from(permSet)
 *   // pass permissions:string[] down to client component, then:
 *   <Gated permission="foo.bar" perms={permissions} mode="disable"><button>…</button></Gated>
 */
export function Gated({ permission, perms, mode, tooltip, children }: GatedProps) {
  if (permits(perms, permission)) return children

  if (mode === 'hide') return null

  const label = PERMISSION_LABELS[permission] ?? PERMISSION_FALLBACK
  const tip = tooltip ?? `You don't have permission to ${label}.`

  if (!isValidElement(children)) return null

  const existingStyle = (children.props as { style?: React.CSSProperties }).style ?? {}
  return cloneElement(children as ReactElement<Record<string, unknown>>, {
    disabled: true,
    'aria-disabled': true,
    title: tip,
    style: {
      ...existingStyle,
      opacity: 0.45,
      cursor: 'not-allowed',
      pointerEvents: 'none' as const,
    },
  })
}

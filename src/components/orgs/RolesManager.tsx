'use client'

import { useState, useTransition } from 'react'
import {
  createRole,
  updateRolePermissions,
  renameRole,
  deleteRole,
} from '@/lib/orgs/role-actions'

interface Role {
  id: string
  name: string
  slug: string
  is_builtin: boolean
  permissionKeys: string[]
}

interface PermissionCategory {
  label: string
  keys: string[]
}

interface RolesManagerProps {
  orgId: string
  orgSlug: string
  roles: Role[]
  permissionCategories: PermissionCategory[]
  permissionLabels: Record<string, string>
  actorHeldKeys: string[]
}

// Per-role editable state for the matrix
interface RoleState {
  name: string
  permSet: Set<string>
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  saveError: string | null
  dirty: boolean
}

function buildInitialState(roles: Role[]): Record<string, RoleState> {
  const map: Record<string, RoleState> = {}
  for (const r of roles) {
    map[r.id] = {
      name: r.name,
      permSet: new Set(r.permissionKeys),
      saveStatus: 'idle',
      saveError: null,
      dirty: false,
    }
  }
  return map
}

export function RolesManager({
  orgId,
  orgSlug,
  roles: initialRoles,
  permissionCategories,
  permissionLabels,
  actorHeldKeys,
}: RolesManagerProps) {
  const actorHeldSet = new Set(actorHeldKeys)
  const isSuperAdmin = actorHeldSet.has('*')

  const [roles, setRoles] = useState<Role[]>(initialRoles)
  const [roleState, setRoleState] = useState<Record<string, RoleState>>(
    buildInitialState(initialRoles)
  )

  // New role creation
  const [showNewRole, setShowNewRole] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleError, setNewRoleError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Rename state per role
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function canActorGrant(key: string): boolean {
    return isSuperAdmin || actorHeldSet.has(key)
  }

  function togglePerm(roleId: string, key: string) {
    const rs = roleState[roleId]
    if (!rs) return
    const newSet = new Set(rs.permSet)
    if (newSet.has(key)) {
      newSet.delete(key)
    } else {
      newSet.add(key)
    }
    setRoleState(prev => ({
      ...prev,
      [roleId]: { ...prev[roleId], permSet: newSet, dirty: true, saveStatus: 'idle', saveError: null },
    }))
  }

  async function handleSave(roleId: string) {
    setRoleState(prev => ({
      ...prev,
      [roleId]: { ...prev[roleId], saveStatus: 'saving', saveError: null },
    }))
    const keys = [...roleState[roleId].permSet]
    const result = await updateRolePermissions(roleId, keys)
    if ('error' in result) {
      setRoleState(prev => ({
        ...prev,
        [roleId]: { ...prev[roleId], saveStatus: 'error', saveError: result.error },
      }))
    } else {
      setRoleState(prev => ({
        ...prev,
        [roleId]: { ...prev[roleId], saveStatus: 'saved', dirty: false },
      }))
      setTimeout(() => {
        setRoleState(prev => ({
          ...prev,
          [roleId]: { ...prev[roleId], saveStatus: 'idle' },
        }))
      }, 2000)
    }
  }

  async function handleCreateRole() {
    setNewRoleError(null)
    const result = await createRole(orgId, newRoleName.trim())
    if ('error' in result) {
      setNewRoleError(result.error)
      return
    }
    const newRole: Role = {
      id: result.role.id,
      name: result.role.name,
      slug: result.role.slug,
      is_builtin: false,
      permissionKeys: [],
    }
    setRoles(prev => [...prev, newRole])
    setRoleState(prev => ({
      ...prev,
      [result.role.id]: {
        name: result.role.name,
        permSet: new Set(),
        saveStatus: 'idle',
        saveError: null,
        dirty: false,
      },
    }))
    setNewRoleName('')
    setShowNewRole(false)
  }

  function startRename(role: Role) {
    setRenamingId(role.id)
    setRenameValue(role.name)
    setRenameError(null)
  }

  async function handleRename(roleId: string) {
    setRenameError(null)
    const result = await renameRole(roleId, renameValue)
    if ('error' in result) {
      setRenameError(result.error)
      return
    }
    setRoles(prev => prev.map(r => r.id === roleId ? { ...r, name: renameValue.trim() } : r))
    setRoleState(prev => ({
      ...prev,
      [roleId]: { ...prev[roleId], name: renameValue.trim() },
    }))
    setRenamingId(null)
  }

  async function handleDelete(roleId: string) {
    setDeletingId(roleId)
    setDeleteError(null)
    const result = await deleteRole(roleId)
    setDeletingId(null)
    if ('error' in result) {
      setDeleteError(result.error)
      return
    }
    setRoles(prev => prev.filter(r => r.id !== roleId))
    setRoleState(prev => {
      const next = { ...prev }
      delete next[roleId]
      return next
    })
  }

  return (
    <div>
      {/* Delete error banner */}
      {deleteError && (
        <div className="mb-4 rounded-lg px-4 py-3"
          style={{ background: 'var(--pz-error-bg)', border: '1px solid var(--pz-error)' }}>
          <p className="text-sm" style={{ color: 'var(--pz-error)' }}>{deleteError}</p>
          <button
            onClick={() => setDeleteError(null)}
            className="text-xs mt-1 underline"
            style={{ color: 'var(--pz-error)' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Role Permissions Matrix */}
      <section className="mb-6 rounded-xl border border-[var(--pz-border)] bg-[var(--pz-surface)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--pz-border)]">
          <h2 className="text-base font-semibold text-[var(--pz-text)]">Role Permissions</h2>
          <button
            onClick={() => { setShowNewRole(true); setNewRoleError(null) }}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ background: 'var(--pz-teal)', color: 'var(--pz-bg)' }}
          >
            + New role
          </button>
        </div>

        {/* New role input */}
        {showNewRole && (
          <div className="px-6 py-3 border-b border-[var(--pz-border)]"
            style={{ background: 'var(--pz-surface-2)' }}>
            <div className="flex items-center gap-3">
              <input
                autoFocus
                type="text"
                value={newRoleName}
                onChange={e => setNewRoleName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') startTransition(() => { void handleCreateRole() })
                  if (e.key === 'Escape') { setShowNewRole(false); setNewRoleName('') }
                }}
                placeholder="Role name (e.g. Media Staff)"
                className="flex-1 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
                style={{
                  borderColor: 'var(--pz-border)',
                  background: 'var(--pz-bg)',
                  color: 'var(--pz-text)',
                }}
              />
              <button
                onClick={() => startTransition(() => { void handleCreateRole() })}
                disabled={!newRoleName.trim()}
                className="rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40 hover:opacity-80"
                style={{ background: 'var(--pz-teal)', color: 'var(--pz-bg)' }}
              >
                Create
              </button>
              <button
                onClick={() => { setShowNewRole(false); setNewRoleName(''); setNewRoleError(null) }}
                className="rounded-md px-3 py-1.5 text-xs hover:opacity-70"
                style={{ color: 'var(--pz-muted)' }}
              >
                Cancel
              </button>
            </div>
            {newRoleError && (
              <p className="mt-1.5 text-xs" style={{ color: 'var(--pz-error)' }}>{newRoleError}</p>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{
                  textAlign: 'left', padding: '10px 24px', color: 'var(--pz-muted)',
                  fontWeight: 600, minWidth: 200,
                }}>
                  Permission
                </th>
                {roles.map(role => {
                  const rs = roleState[role.id]
                  const isOwner = role.slug === 'owner'
                  const isCustom = !role.is_builtin
                  return (
                    <th key={role.id} style={{
                      textAlign: 'center', padding: '10px 16px',
                      color: 'var(--pz-muted)', fontWeight: 600,
                      verticalAlign: 'bottom', minWidth: 120,
                    }}>
                      <div className="flex flex-col items-center gap-1">
                        {/* Rename or display */}
                        {renamingId === role.id ? (
                          <div className="flex flex-col items-center gap-1">
                            <input
                              autoFocus
                              type="text"
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') startTransition(() => { void handleRename(role.id) })
                                if (e.key === 'Escape') { setRenamingId(null); setRenameError(null) }
                              }}
                              className="w-24 rounded border px-1.5 py-0.5 text-xs text-center focus:outline-none"
                              style={{
                                borderColor: 'var(--pz-border)',
                                background: 'var(--pz-bg)',
                                color: 'var(--pz-text)',
                              }}
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() => startTransition(() => { void handleRename(role.id) })}
                                className="text-xs hover:opacity-70"
                                style={{ color: 'var(--pz-teal-ink)' }}
                              >
                                Save
                              </button>
                              <button
                                onClick={() => { setRenamingId(null); setRenameError(null) }}
                                className="text-xs hover:opacity-70"
                                style={{ color: 'var(--pz-muted)' }}
                              >
                                ✕
                              </button>
                            </div>
                            {renameError && (
                              <p className="text-xs" style={{ color: 'var(--pz-error)' }}>{renameError}</p>
                            )}
                          </div>
                        ) : (
                          <span className="capitalize">{role.name}</span>
                        )}

                        {/* Owner locked badge */}
                        {isOwner && renamingId !== role.id && (
                          <span className="rounded-full px-1.5 py-0.5 text-xs"
                            style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)', fontSize: 10 }}>
                            locked
                          </span>
                        )}

                        {/* Custom role controls */}
                        {isCustom && renamingId !== role.id && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <button
                              onClick={() => startRename(role)}
                              className="text-xs hover:opacity-70"
                              style={{ color: 'var(--pz-muted)' }}
                              title="Rename role"
                            >
                              Rename
                            </button>
                            <span style={{ color: 'var(--pz-border)' }}>|</span>
                            <button
                              onClick={() => startTransition(() => { void handleDelete(role.id) })}
                              disabled={deletingId === role.id}
                              className="text-xs hover:opacity-70 disabled:opacity-40"
                              style={{ color: 'var(--pz-error)' }}
                              title="Delete role"
                            >
                              {deletingId === role.id ? '…' : 'Delete'}
                            </button>
                          </div>
                        )}

                        {/* Save / status */}
                        {!isOwner && renamingId !== role.id && (
                          <div className="mt-1 min-h-[22px]">
                            {rs?.saveStatus === 'idle' && rs.dirty && (
                              <button
                                onClick={() => startTransition(() => { void handleSave(role.id) })}
                                className="rounded px-2 py-0.5 text-xs font-semibold hover:opacity-80 transition-opacity"
                                style={{ background: 'var(--pz-teal)', color: 'var(--pz-bg)' }}
                              >
                                Save
                              </button>
                            )}
                            {rs?.saveStatus === 'saving' && (
                              <span className="text-xs" style={{ color: 'var(--pz-muted)' }}>Saving…</span>
                            )}
                            {rs?.saveStatus === 'saved' && (
                              <span className="text-xs" style={{ color: 'var(--pz-teal-ink)' }}>Saved ✓</span>
                            )}
                            {rs?.saveStatus === 'error' && (
                              <span className="text-xs" style={{ color: 'var(--pz-error)' }} title={rs.saveError ?? ''}>
                                Error
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {permissionCategories.map(cat => (
                <>
                  <tr key={`cat-${cat.label}`}>
                    <td
                      colSpan={1 + roles.length}
                      style={{
                        padding: '10px 24px 4px',
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--pz-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                        borderTop: '1px solid var(--pz-border)',
                      }}
                    >
                      {cat.label}
                    </td>
                  </tr>
                  {cat.keys.map(key => (
                    <tr key={key} style={{ borderTop: '1px solid var(--pz-border)' }}>
                      <td style={{ padding: '6px 24px', color: 'var(--pz-text)' }}>
                        {permissionLabels[key] ?? key}
                      </td>
                      {roles.map(role => {
                        const rs = roleState[role.id]
                        const isOwner = role.slug === 'owner'
                        const checked = isOwner ? true : (rs?.permSet.has(key) ?? false)
                        const canGrant = canActorGrant(key)
                        const disabled = isOwner || !canGrant
                        const title = isOwner
                          ? 'Owner permissions are locked'
                          : !canGrant
                            ? "You can't grant a permission you don't have"
                            : undefined
                        return (
                          <td key={role.id} style={{ textAlign: 'center', padding: '6px 16px' }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => togglePerm(role.id, key)}
                              title={title}
                              style={{
                                width: 15,
                                height: 15,
                                cursor: disabled ? 'not-allowed' : 'pointer',
                                accentColor: 'var(--pz-teal)',
                              }}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* Per-role save error details (below table) */}
        {roles.map(role => {
          const rs = roleState[role.id]
          if (rs?.saveStatus !== 'error' || !rs.saveError) return null
          return (
            <div key={`err-${role.id}`} className="px-6 py-2 border-t border-[var(--pz-border)]"
              style={{ background: 'var(--pz-error-bg)' }}>
              <p className="text-xs" style={{ color: 'var(--pz-error)' }}>
                <strong>{role.name}:</strong> {rs.saveError}
              </p>
            </div>
          )
        })}
      </section>

      <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>
        Changes apply immediately after saving. The owner role is frozen — its permissions cannot be modified.
      </p>
    </div>
  )
}

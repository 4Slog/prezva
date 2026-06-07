import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Gated } from '@/components/auth/Gated'

const PERMS_ALL  = ['*']
const PERMS_HAVE = ['volunteers.manage', 'org.settings']
const PERMS_NONE: string[] = []

describe('Gated', () => {
  describe('mode=hide', () => {
    it('renders child when permitted', () => {
      render(
        <Gated permission="volunteers.manage" perms={PERMS_HAVE} mode="hide">
          <button>Add</button>
        </Gated>
      )
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    })

    it('renders nothing when not permitted', () => {
      render(
        <Gated permission="sponsors.manage" perms={PERMS_HAVE} mode="hide">
          <button>Delete</button>
        </Gated>
      )
      expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    })

    it('renders child when perms contains "*"', () => {
      render(
        <Gated permission="sponsors.manage" perms={PERMS_ALL} mode="hide">
          <button>Delete</button>
        </Gated>
      )
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })
  })

  describe('mode=disable', () => {
    it('renders child enabled when permitted', () => {
      render(
        <Gated permission="org.settings" perms={PERMS_HAVE} mode="disable">
          <button>Save</button>
        </Gated>
      )
      const btn = screen.getByRole('button', { name: 'Save' })
      expect(btn).toBeInTheDocument()
      expect(btn).not.toBeDisabled()
    })

    it('renders child disabled with tooltip when not permitted', () => {
      render(
        <Gated permission="sponsors.manage" perms={PERMS_NONE} mode="disable">
          <button>Save</button>
        </Gated>
      )
      const btn = screen.getByRole('button', { name: 'Save' })
      expect(btn).toBeDisabled()
      expect(btn).toHaveAttribute('title', "You don't have permission to manage sponsors.")
      expect(btn).toHaveAttribute('aria-disabled', 'true')
    })

    it('renders child enabled when perms contains "*"', () => {
      render(
        <Gated permission="sponsors.manage" perms={PERMS_ALL} mode="disable">
          <button>Save</button>
        </Gated>
      )
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
    })

    it('uses PERMISSION_LABELS for tooltip text', () => {
      render(
        <Gated permission="checkin.manage" perms={PERMS_NONE} mode="disable">
          <button>Check In</button>
        </Gated>
      )
      expect(screen.getByRole('button')).toHaveAttribute(
        'title',
        "You don't have permission to check in attendees."
      )
    })

    it('accepts custom tooltip override', () => {
      render(
        <Gated permission="checkin.manage" perms={PERMS_NONE} mode="disable" tooltip="Ask your admin.">
          <button>Check In</button>
        </Gated>
      )
      expect(screen.getByRole('button')).toHaveAttribute('title', 'Ask your admin.')
    })
  })
})

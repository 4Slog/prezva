import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Users, Settings } from 'lucide-react'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props as React.AnchorHTMLAttributes<HTMLAnchorElement>}>{children}</a>
  ),
}))

import { usePathname } from 'next/navigation'
import { SideNav } from '@/components/ui/SideNav'
import type { SideNavGroup } from '@/components/ui/SideNav'

const GROUP_A: SideNavGroup = {
  id: 'groupA',
  label: 'Group A',
  icon: Users,
  items: [
    { label: 'Item A1', href: '/a/item1' },
    { label: 'Item A2', href: '/a/item2' },
  ],
}

const GROUP_B: SideNavGroup = {
  id: 'groupB',
  label: 'Group B',
  icon: Settings,
  items: [
    { label: 'Item B1', href: '/b/item1' },
  ],
}

const GROUP_EMPTY: SideNavGroup = {
  id: 'groupEmpty',
  label: 'Empty Group',
  icon: Users,
  items: [],
}

describe('SideNav', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/')
  })

  describe('collapsed=true — group icons navigate to items[0]', () => {
    it('renders a link for each non-empty group pointing to its first item', () => {
      render(<SideNav groups={[GROUP_A, GROUP_B]} collapsed={true} />)
      expect(screen.getByRole('link', { name: 'Group A' })).toHaveAttribute('href', '/a/item1')
      expect(screen.getByRole('link', { name: 'Group B' })).toHaveAttribute('href', '/b/item1')
    })

    it('renders no toggle buttons when collapsed', () => {
      render(<SideNav groups={[GROUP_A]} collapsed={true} />)
      expect(screen.queryByRole('button')).toBeNull()
    })

    it('does not crash and renders no anchor when a group has empty items', () => {
      render(<SideNav groups={[GROUP_EMPTY]} collapsed={true} />)
      expect(screen.queryByRole('link', { name: 'Empty Group' })).toBeNull()
    })
  })

  describe('N2 — manual toggle overrides active group', () => {
    it('clicking group B opens B even when group A is the active route', () => {
      vi.mocked(usePathname).mockReturnValue('/a/item1')
      render(<SideNav groups={[GROUP_A, GROUP_B]} collapsed={false} />)

      // Group A is active — its items are visible
      expect(screen.getByText('Item A1')).toBeInTheDocument()
      // Group B items are not visible yet
      expect(screen.queryByText('Item B1')).toBeNull()

      // Manually click group B's header button
      fireEvent.click(screen.getByRole('button', { name: 'Group B' }))

      // Group B should now be open regardless of group A being active
      expect(screen.getByText('Item B1')).toBeInTheDocument()
    })
  })
})

// Batch H5 (O171, H-R5): group chat is hidden for launch — the page is a 404,
// the attendee More menu has no Groups item, and nothing links to it.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { execFileSync } from 'node:child_process'

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  usePathname: () => '/e/conf',
}))
vi.mock('@/components/layout/NotificationBell', () => ({ NotificationBell: () => null }))

import GroupsPage from '@/app/e/[slug]/groups/page'
import { AttendeeShell } from '@/components/attendee/AttendeeShell'

describe('group chat hidden', () => {
  it('/e/[slug]/groups is a 404', () => {
    expect(() => GroupsPage()).toThrow('NEXT_NOT_FOUND')
  })

  it('the More menu has no Groups item', () => {
    render(<AttendeeShell event={{ title: 'Conf', slug: 'conf' }} hasRegistration><div /></AttendeeShell>)
    for (const more of screen.getAllByText('More')) fireEvent.click(more)
    expect(screen.getAllByText('Speakers').length).toBeGreaterThan(0)
    expect(screen.queryByText('Groups')).not.toBeInTheDocument()
    expect(document.querySelector('a[href="/e/conf/groups"]')).toBeNull()
  })

  it('nothing in src links to the groups page', () => {
    let out = ''
    try {
      out = execFileSync('grep', ['-rnE', '/groups[\'"`]|\\$\\{base\\}/groups', 'src', '--include=*.ts', '--include=*.tsx', '--exclude-dir=__tests__'], { encoding: 'utf8' })
    } catch (e) { out = (e as { stdout?: string }).stdout ?? '' }
    expect(out.trim()).toBe('')
  })
})

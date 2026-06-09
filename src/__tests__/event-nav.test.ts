import { describe, it, expect } from 'vitest'
import { buildEventNav } from '@/lib/events/event-nav'

describe('buildEventNav', () => {
  it('includes Tickets item by default (no flags)', () => {
    const { groups } = buildEventNav('slug-abc')
    const people = groups.find(g => g.id === 'people')!
    expect(people.items.some(i => i.href.endsWith('/tickets'))).toBe(true)
  })

  it('includes Tickets item when canTickets:true', () => {
    const { groups } = buildEventNav('slug-abc', { canTickets: true })
    const people = groups.find(g => g.id === 'people')!
    expect(people.items.some(i => i.href.endsWith('/tickets'))).toBe(true)
  })

  it('omits Tickets item when canTickets:false', () => {
    const { groups } = buildEventNav('slug-abc', { canTickets: false })
    const people = groups.find(g => g.id === 'people')!
    expect(people.items.some(i => i.href.endsWith('/tickets'))).toBe(false)
  })

  it('keeps other People items intact when canTickets:false', () => {
    const { groups } = buildEventNav('slug-abc', { canTickets: false })
    const people = groups.find(g => g.id === 'people')!
    const hrefs = people.items.map(i => i.href)
    expect(hrefs.some(h => h.endsWith('/attendees'))).toBe(true)
    expect(hrefs.some(h => h.endsWith('/checkin'))).toBe(true)
    expect(hrefs.some(h => h.endsWith('/badges'))).toBe(true)
  })
})

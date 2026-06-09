import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TicketManager } from '@/components/registration/TicketManager'
import { DiscountCodeManager } from '@/components/registration/DiscountCodeManager'
import { FormFieldManager } from '@/components/registration/FormFieldManager'

vi.mock('@/lib/registration/ticket-actions', () => ({
  createTicketType: vi.fn(),
  deleteTicketType: vi.fn(),
}))
vi.mock('@/lib/events/discount-actions', () => ({
  createDiscountCode: vi.fn(),
  toggleDiscountCode: vi.fn(),
  deleteDiscountCode: vi.fn(),
}))
vi.mock('@/lib/events/form-field-actions', () => ({
  createFormField: vi.fn(),
  deleteFormField: vi.fn(),
  reorderFormFields: vi.fn(),
}))

const EVENT_ID = 'evt-test'
const PERMS_HAVE = ['event.tickets', 'event.manage']
const PERMS_NONE: string[] = []

describe('Registration manager Add controls — permission gating', () => {
  describe('TicketManager', () => {
    it('Add ticket type button is enabled with event.tickets', () => {
      render(<TicketManager eventId={EVENT_ID} tickets={[]} permissions={PERMS_HAVE} />)
      expect(screen.getByRole('button', { name: /add ticket type/i })).not.toBeDisabled()
    })

    it('Add ticket type button is disabled without event.tickets', () => {
      render(<TicketManager eventId={EVENT_ID} tickets={[]} permissions={PERMS_NONE} />)
      expect(screen.getByRole('button', { name: /add ticket type/i })).toBeDisabled()
    })
  })

  describe('DiscountCodeManager', () => {
    it('Create code button is enabled with event.tickets', () => {
      render(<DiscountCodeManager eventId={EVENT_ID} initial={[]} permissions={PERMS_HAVE} />)
      expect(screen.getByRole('button', { name: /create code/i })).not.toBeDisabled()
    })

    it('Create code button is disabled without event.tickets', () => {
      render(<DiscountCodeManager eventId={EVENT_ID} initial={[]} permissions={PERMS_NONE} />)
      expect(screen.getByRole('button', { name: /create code/i })).toBeDisabled()
    })
  })

  describe('FormFieldManager', () => {
    it('Add question button is enabled with event.manage', () => {
      render(<FormFieldManager eventId={EVENT_ID} initial={[]} tickets={[]} permissions={PERMS_HAVE} />)
      expect(screen.getByRole('button', { name: /add question/i })).not.toBeDisabled()
    })

    it('Add question button is disabled without event.manage', () => {
      render(<FormFieldManager eventId={EVENT_ID} initial={[]} tickets={[]} permissions={PERMS_NONE} />)
      expect(screen.getByRole('button', { name: /add question/i })).toBeDisabled()
    })
  })
})

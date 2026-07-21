import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { GhlProductPicker } from './ghl-product-picker'
import { listGhlProductsForPicker, createTicketTypeFromEmbedProduct } from '@/lib/embedded/event-actions'
import type { GhlPickerProduct } from '@/lib/embedded/event-actions'

vi.mock('@/lib/embedded/event-actions', () => ({
  listGhlProductsForPicker: vi.fn(),
  createTicketTypeFromEmbedProduct: vi.fn(),
}))

const PRODUCT: GhlPickerProduct = {
  productId: 'prod_1',
  priceId: 'price_1',
  productName: 'General Admission',
  priceName: 'General Admission',
  amount: 50,
  currency: 'usd',
  availableQuantity: 100,
  alreadyMapped: false,
}

beforeEach(() => {
  vi.mocked(listGhlProductsForPicker).mockResolvedValue([PRODUCT])
})

describe('GhlProductPicker entitlement gating', () => {
  it('shows an active Link button and no banner when entitled', async () => {
    render(<GhlProductPicker eventId="evt_1" entitled={true} />)

    const button = await screen.findByRole('button', { name: 'Link' })
    expect(button).not.toBeDisabled()
    expect(screen.queryByText('Linking products requires an active Prezva plan')).toBeNull()
  })

  it('shows a disabled Link button and a banner when not entitled, product still visible', async () => {
    render(<GhlProductPicker eventId="evt_1" entitled={false} />)

    expect(await screen.findByText('General Admission')).toBeInTheDocument()
    expect(screen.getByText('Linking products requires an active Prezva plan')).toBeInTheDocument()

    const button = screen.getByRole('button', { name: 'Link' })
    expect(button).toBeDisabled()
  })

  it('does not call createTicketTypeFromEmbedProduct when clicked while unentitled', async () => {
    render(<GhlProductPicker eventId="evt_1" entitled={false} />)

    const button = await screen.findByRole('button', { name: 'Link' })
    button.click()

    await waitFor(() => expect(button).toBeDisabled())
    expect(createTicketTypeFromEmbedProduct).not.toHaveBeenCalled()
  })
})

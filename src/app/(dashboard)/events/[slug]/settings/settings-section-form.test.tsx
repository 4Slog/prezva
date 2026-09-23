import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsSectionForm } from './settings-section-form'
import { TimezoneOptions } from '@/components/events/TimezoneOptions'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

beforeEach(() => mockRefresh.mockReset())

function renderForm(action: (fd: FormData) => Promise<{ success: true } | { error: string }>) {
  render(
    <SettingsSectionForm action={action} resetKey="k1">
      <input name="title" defaultValue="Old" />
      <button type="submit">Save</button>
    </SettingsSectionForm>,
  )
}

describe('SettingsSectionForm (every updateEvent form uses it)', () => {
  it('shows the error text the action returns, and keeps the typed value', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'End time must be after start time' })
    renderForm(action)
    fireEvent.change(screen.getByDisplayValue('Old'), { target: { value: 'Typed' } })
    fireEvent.click(screen.getByText('Save'))
    expect(await screen.findByRole('alert')).toHaveTextContent('End time must be after start time')
    expect(screen.getByDisplayValue('Typed')).toBeInTheDocument()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('passes the form fields to the action and confirms success', async () => {
    const action = vi.fn().mockResolvedValue({ success: true })
    renderForm(action)
    fireEvent.click(screen.getByText('Save'))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
    expect((action.mock.calls[0][0] as FormData).get('title')).toBe('Old')
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
  })

  it('shows a thrown error instead of swallowing it', async () => {
    renderForm(vi.fn().mockRejectedValue(new Error('network down')))
    fireEvent.click(screen.getByText('Save'))
    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
  })
})

describe('TimezoneOptions', () => {
  function values(current: string | null) {
    const { container } = render(<select defaultValue={current ?? undefined}><TimezoneOptions current={current} /></select>)
    const select = container.querySelector('select')!
    return { select, values: Array.from(select.options).map(o => o.value) }
  }

  it('offers (and selects) a current zone that is not in the short list', () => {
    const { select, values: v } = values('America/Phoenix')
    expect(v[0]).toBe('America/Phoenix')
    expect(select.value).toBe('America/Phoenix')
  })

  it('does not duplicate a listed zone', () => {
    const { values: v } = values('America/Chicago')
    expect(v.filter(x => x === 'America/Chicago')).toHaveLength(1)
    expect(v).toHaveLength(5)
  })
})

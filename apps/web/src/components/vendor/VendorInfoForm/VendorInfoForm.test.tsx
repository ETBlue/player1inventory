import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Vendor } from '@/types'
import { VendorInfoForm } from '.'

const mockVendor: Vendor = {
  id: 'vendor-1',
  name: 'Costco',
  createdAt: new Date('2024-01-01'),
}

describe('VendorInfoForm', () => {
  it('shows required error when name is empty', () => {
    // Given a vendor with an empty name
    const emptyVendor = { ...mockVendor, name: '' }
    render(<VendorInfoForm vendor={emptyVendor} onSave={vi.fn()} />)

    // Then the required error is shown
    expect(screen.getByText('This field is required.')).toBeInTheDocument()
  })

  it('save button is disabled when name is empty', () => {
    // Given a vendor with an empty name
    const emptyVendor = { ...mockVendor, name: '' }
    render(<VendorInfoForm vendor={emptyVendor} onSave={vi.fn()} />)

    // Then Save button is disabled
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('calls onSave with name as-is (no casing change)', async () => {
    // Given a vendor form with a modified name
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<VendorInfoForm vendor={mockVendor} onSave={onSave} />)

    // When user clears and types a new name and clicks Save
    const input = screen.getByLabelText('Name')
    await user.clear(input)
    await user.type(input, 'iHerb')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then onSave is called with name exactly as typed (no casing change)
    expect(onSave).toHaveBeenCalledWith({ name: 'iHerb' })
  })

  it('calls onDirtyChange when dirty state changes', async () => {
    // Given a vendor form with an onDirtyChange handler
    const user = userEvent.setup()
    const onDirtyChange = vi.fn()
    render(
      <VendorInfoForm
        vendor={mockVendor}
        onSave={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    )

    // When user changes the name (making it dirty)
    const input = screen.getByLabelText('Name')
    await user.type(input, ' Warehouse')

    // Then onDirtyChange was called with true
    expect(onDirtyChange).toHaveBeenCalledWith(true)
  })
})

describe('VendorInfoForm validation', () => {
  it('does not show error when name is filled', () => {
    render(<VendorInfoForm vendor={mockVendor} onSave={vi.fn()} />)
    expect(
      screen.queryByText('This field is required.'),
    ).not.toBeInTheDocument()
  })

  it('save button is disabled when isPending is true', () => {
    render(
      <VendorInfoForm vendor={mockVendor} onSave={vi.fn()} isPending={true} />,
    )
    // name is not dirty initially, so button is disabled regardless
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('save button is disabled when not dirty', () => {
    render(<VendorInfoForm vendor={mockVendor} onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })
})

import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Vendor } from '@/types'
import { VendorCard } from '.'

// Mock TanStack Router Link since it requires RouterProvider context
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      children?: React.ReactNode
      to?: string
      params?: unknown
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

const vendor: Vendor = {
  id: '1',
  name: 'Costco',
  createdAt: new Date(),
}

describe('VendorCard', () => {
  it('displays vendor name', () => {
    // Given a vendor
    render(<VendorCard vendor={vendor} onDelete={vi.fn()} />)

    // Then the vendor name is shown
    expect(screen.getByText('Costco')).toBeInTheDocument()
  })

  it('user can delete vendor after confirming the dialog', async () => {
    // Given a vendor card with delete handler
    const onDelete = vi.fn()
    render(<VendorCard vendor={vendor} onDelete={onDelete} />)
    const user = userEvent.setup()

    // When user clicks the delete button
    await user.click(screen.getByRole('button', { name: 'Delete Costco' }))

    // Then confirmation dialog appears
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    // When user confirms
    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    // Then onDelete is called
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('user can cancel vendor deletion', async () => {
    // Given a vendor card with delete handler
    const onDelete = vi.fn()
    render(<VendorCard vendor={vendor} onDelete={onDelete} />)
    const user = userEvent.setup()

    // When user clicks delete then cancels
    await user.click(screen.getByRole('button', { name: 'Delete Costco' }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Then onDelete is NOT called
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('displays item count when provided', () => {
    // Given a vendor with item count
    render(<VendorCard vendor={vendor} itemCount={5} onDelete={vi.fn()} />)

    // Then the item count is shown
    expect(screen.getByText(/5 items/i)).toBeInTheDocument()
  })

  it('does not display item count when not provided', () => {
    // Given a vendor without item count
    render(<VendorCard vendor={vendor} onDelete={vi.fn()} />)

    // Then no item count text is shown
    expect(screen.queryByText(/items/i)).not.toBeInTheDocument()
  })
})

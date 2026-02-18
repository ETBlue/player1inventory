import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Vendor } from '@/types'
import { VendorCard } from './VendorCard'

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
    render(<VendorCard vendor={vendor} onEdit={vi.fn()} onDelete={vi.fn()} />)

    // Then the vendor name is shown
    expect(screen.getByText('Costco')).toBeInTheDocument()
  })

  it('calls onEdit when edit button is clicked', async () => {
    // Given a vendor card
    const onEdit = vi.fn()
    render(<VendorCard vendor={vendor} onEdit={onEdit} onDelete={vi.fn()} />)
    const user = userEvent.setup()

    // When edit button is clicked
    await user.click(screen.getByRole('button', { name: 'Edit Costco' }))

    // Then onEdit is called
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('calls onDelete when delete button is clicked', async () => {
    // Given a vendor card
    const onDelete = vi.fn()
    render(<VendorCard vendor={vendor} onEdit={vi.fn()} onDelete={onDelete} />)
    const user = userEvent.setup()

    // When delete button is clicked
    await user.click(screen.getByRole('button', { name: 'Delete Costco' }))

    // Then onDelete is called
    expect(onDelete).toHaveBeenCalledOnce()
  })
})

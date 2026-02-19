import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vendor } from '@/types'

// Mock TanStack Router
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({
      children,
      to,
      ...props
    }: {
      children?: React.ReactNode
      to: string
      [key: string]: unknown
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

// Mock vendor hooks
vi.mock('@/hooks/useVendors', () => ({
  useVendors: vi.fn(),
  useDeleteVendor: vi.fn(),
}))

const { useVendors, useDeleteVendor } = await import('@/hooks/useVendors')

const mockVendors: Vendor[] = [
  { id: '1', name: 'Costco', createdAt: new Date() },
  { id: '2', name: "Trader Joe's", createdAt: new Date() },
]

const setupMocks = (vendors: Vendor[] = mockVendors) => {
  const mutate = vi.fn()
  vi.mocked(useVendors).mockReturnValue({
    data: vendors,
    isLoading: false,
  } as ReturnType<typeof useVendors>)
  vi.mocked(useDeleteVendor).mockReturnValue({ mutate } as ReturnType<
    typeof useDeleteVendor
  >)
  return { mutate }
}

import { Route } from './vendors/index'

const VendorSettings = Route.options.component as () => JSX.Element

describe('Vendor Settings Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderPage = (vendors?: Vendor[]) => {
    setupMocks(vendors)
    return render(<VendorSettings />)
  }

  it('user can see the vendor list', () => {
    // Given two vendors exist
    renderPage()

    // Then both vendor names are shown
    expect(screen.getByText('Costco')).toBeInTheDocument()
    expect(screen.getByText("Trader Joe's")).toBeInTheDocument()
  })

  it('user can see empty state when no vendors exist', () => {
    // Given no vendors
    renderPage([])

    // Then empty state message is shown
    expect(
      screen.getByText('No vendors yet. Add your first vendor.'),
    ).toBeInTheDocument()
  })

  it('user can navigate to new vendor page when clicking New Vendor', async () => {
    // Given the vendors page
    renderPage()
    const user = userEvent.setup()

    // When user clicks "New Vendor"
    await user.click(screen.getByRole('button', { name: /new vendor/i }))

    // Then navigate is called to go to new vendor page
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/vendors/new' })
  })

  it('user can delete a vendor with confirmation', async () => {
    // Given a vendor
    const { mutate } = setupMocks([
      { id: '1', name: 'Costco', createdAt: new Date() },
    ])
    render(<VendorSettings />)
    const user = userEvent.setup()

    // When user clicks the delete button
    await user.click(screen.getByRole('button', { name: 'Delete Costco' }))

    // Then confirmation dialog appears
    await screen.findByText(/delete "costco"/i)

    // When user confirms
    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    // Then deleteVendor mutation is called with the vendor id
    expect(mutate).toHaveBeenCalledWith('1')
  })
})

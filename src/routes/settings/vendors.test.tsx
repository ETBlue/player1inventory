import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vendor } from '@/types'

// Mock TanStack Router
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

// Mock vendor hooks
vi.mock('@/hooks/useVendors', () => ({
  useVendors: vi.fn(),
  useCreateVendor: vi.fn(),
  useUpdateVendor: vi.fn(),
  useDeleteVendor: vi.fn(),
}))

const { useVendors, useCreateVendor, useUpdateVendor, useDeleteVendor } =
  await import('@/hooks/useVendors')

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
  vi.mocked(useCreateVendor).mockReturnValue({ mutate } as ReturnType<
    typeof useCreateVendor
  >)
  vi.mocked(useUpdateVendor).mockReturnValue({ mutate } as ReturnType<
    typeof useUpdateVendor
  >)
  vi.mocked(useDeleteVendor).mockReturnValue({ mutate } as ReturnType<
    typeof useDeleteVendor
  >)
  return { mutate }
}

import { Route } from './vendors'

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

  it('user can open the create dialog', async () => {
    // Given the vendors page
    renderPage()
    const user = userEvent.setup()

    // When user clicks "New Vendor"
    await user.click(screen.getByRole('button', { name: /new vendor/i }))

    // Then the dialog opens with "New Vendor" title
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('New Vendor')).toBeInTheDocument()
  })

  it('user can create a vendor via the form', async () => {
    // Given the vendors page
    const { mutate } = setupMocks()
    render(<VendorSettings />)
    const user = userEvent.setup()

    // When user clicks New Vendor, types a name, and saves
    await user.click(screen.getByRole('button', { name: /new vendor/i }))
    await user.type(screen.getByLabelText('Name'), 'Whole Foods')
    await user.click(screen.getByRole('button', { name: /add vendor/i }))

    // Then createVendor mutation is called with the name
    expect(mutate).toHaveBeenCalledWith('Whole Foods', expect.anything())
  })

  it('user can open the edit dialog for a vendor', async () => {
    // Given a vendor exists
    renderPage([{ id: '1', name: 'Costco', createdAt: new Date() }])
    const user = userEvent.setup()

    // When user clicks the edit button for Costco
    await user.click(screen.getByRole('button', { name: 'Edit Costco' }))

    // Then the dialog opens in edit mode with pre-filled name
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Edit Vendor')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Name')).toHaveValue('Costco')
  })

  it('user can edit a vendor name', async () => {
    // Given a vendor exists
    const { mutate } = setupMocks([
      { id: '1', name: 'Costco', createdAt: new Date() },
    ])
    render(<VendorSettings />)
    const user = userEvent.setup()

    // When user opens edit dialog and changes the name
    await user.click(screen.getByRole('button', { name: 'Edit Costco' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    const nameInput = screen.getByLabelText('Name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Costco Wholesale')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then updateVendor mutation is called with id and updates object
    expect(mutate).toHaveBeenCalledWith(
      { id: '1', updates: { name: 'Costco Wholesale' } },
      expect.anything(),
    )
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
    await waitFor(() => {
      expect(screen.getByText(/delete "costco"/i)).toBeInTheDocument()
    })

    // When user confirms
    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    // Then deleteVendor mutation is called with the vendor id
    expect(mutate).toHaveBeenCalledWith('1', expect.anything())
  })
})

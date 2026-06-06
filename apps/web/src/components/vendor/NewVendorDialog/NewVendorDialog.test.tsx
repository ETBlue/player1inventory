import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import type { Vendor } from '@/types'
import { NewVendorDialog } from './NewVendorDialog'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...original, useNavigate: () => mockNavigate }
})

const mockNavigate = vi.fn()

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

describe('NewVendorDialog', () => {
  beforeEach(async () => {
    await db.vendors.clear()
    mockNavigate.mockClear()
  })

  it('renders when open is true', () => {
    // Given the dialog is open
    renderWithClient(<NewVendorDialog open={true} onOpenChange={vi.fn()} />)

    // Then the dialog title is visible
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('calls onOpenChange(false) when cancel is clicked', async () => {
    // Given the dialog is open
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    renderWithClient(
      <NewVendorDialog open={true} onOpenChange={onOpenChange} />,
    )

    // When user clicks Cancel
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Then onOpenChange is called with false
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('calls onSuccess with the created vendor when provided', async () => {
    // Given the dialog is open with an onSuccess callback
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    renderWithClient(
      <NewVendorDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    )

    // When user types a name and submits
    await user.type(screen.getByRole('textbox'), 'Costco')
    await user.click(screen.getByRole('button', { name: /new vendor/i }))

    // Then onSuccess is called with the vendor
    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Costco' }) as Vendor,
      )
    })
  })

  it('navigates to vendor detail page when onSuccess is not provided', async () => {
    // Given the dialog is open without onSuccess
    const user = userEvent.setup()
    renderWithClient(<NewVendorDialog open={true} onOpenChange={vi.fn()} />)

    // When user types a name and submits
    await user.type(screen.getByRole('textbox'), 'Whole Foods')
    await user.click(screen.getByRole('button', { name: /new vendor/i }))

    // Then navigate is called to the vendor detail page
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: '/settings/vendors/$id' }),
      )
    })
  })
})

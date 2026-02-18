import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createVendor } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Vendor Detail - Info Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.vendors.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderInfoTab = (vendorId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/settings/vendors/${vendorId}`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can see the vendor name in the heading', async () => {
    // Given a vendor exists
    const vendor = await createVendor('Costco')

    renderInfoTab(vendor.id)

    // Then the vendor name is shown as the page heading
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Costco' }),
      ).toBeInTheDocument()
    })
  })

  it('user can edit the vendor name and save', async () => {
    // Given a vendor exists
    const vendor = await createVendor('Costco')

    renderInfoTab(vendor.id)
    const user = userEvent.setup()

    // When user clears the name field and types a new name
    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toBeInTheDocument()
    })
    const nameInput = screen.getByLabelText('Name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Costco Wholesale')

    // When user clicks Save
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the vendor name is updated in the database
    await waitFor(async () => {
      const updated = await db.vendors.get(vendor.id)
      expect(updated?.name).toBe('Costco Wholesale')
    })
  })

  it('save button is disabled when name has not changed', async () => {
    // Given a vendor exists
    const vendor = await createVendor('Costco')

    renderInfoTab(vendor.id)

    // Then the Save button is disabled when form is clean
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    })
  })
})

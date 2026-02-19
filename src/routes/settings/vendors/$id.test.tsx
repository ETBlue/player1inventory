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

    // Clear sessionStorage (used by useAppNavigation)
    sessionStorage.clear()
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

  it('user can navigate back with back button when navigation history exists', async () => {
    const user = userEvent.setup()

    // Given a vendor
    const vendor = await createVendor('Test Vendor')

    // And navigation history exists (user came from vendors list page)
    // Note: Include only the previous page, the current page will be added by useAppNavigation
    sessionStorage.setItem(
      'app-navigation-history',
      JSON.stringify(['/settings/vendors']),
    )

    renderInfoTab(vendor.id)

    await waitFor(() => {
      expect(screen.getByText('Test Vendor')).toBeInTheDocument()
    })

    // When user clicks back button (now a button, not a link)
    const backButton = screen.getByRole('button', { name: /back/i })
    await user.click(backButton)

    // Then navigates back to previous page (vendors list)
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /vendors/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /new vendor/i }),
      ).toBeInTheDocument()
    })
  })

  it('user can navigate back after saving vendor name', async () => {
    const user = userEvent.setup()

    // Given a vendor
    const vendor = await createVendor('Test Vendor')

    // And navigation history exists (user came from vendors list page)
    // Note: Include only the previous page, the current page will be added by useAppNavigation
    sessionStorage.setItem(
      'app-navigation-history',
      JSON.stringify(['/settings/vendors']),
    )

    renderInfoTab(vendor.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    })

    // When user changes vendor name
    const nameInput = screen.getByLabelText(/name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Updated Vendor')

    // And saves the form
    const saveButton = screen.getByRole('button', { name: /save/i })
    await user.click(saveButton)

    // Then navigates back to previous page (vendors list)
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /vendors/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /new vendor/i }),
      ).toBeInTheDocument()
    })
  })
})

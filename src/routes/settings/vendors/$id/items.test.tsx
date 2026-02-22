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
import { createItem, createVendor } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Vendor Detail - Items Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.vendors.clear()
    await db.inventoryLogs.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderItemsTab = (vendorId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/settings/vendors/${vendorId}/items`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  const makeItem = (name: string, vendorIds: string[] = []) =>
    createItem({
      name,
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds,
    })

  it('user can see all items in the checklist', async () => {
    // Given a vendor and two items
    const vendor = await createVendor('Costco')
    await makeItem('Milk')
    await makeItem('Eggs')

    renderItemsTab(vendor.id)

    // Then both items appear in the list
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeInTheDocument()
      expect(screen.getByLabelText('Eggs')).toBeInTheDocument()
    })
  })

  it('user can see already-assigned items as checked', async () => {
    // Given a vendor and an item already assigned to it
    const vendor = await createVendor('Costco')
    await makeItem('Milk', [vendor.id])
    await makeItem('Eggs')

    renderItemsTab(vendor.id)

    // Then Milk's checkbox is checked and Eggs' is not
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeChecked()
      expect(screen.getByLabelText('Eggs')).not.toBeChecked()
    })
  })

  it('user can filter items by name', async () => {
    // Given a vendor and two items
    const vendor = await createVendor('Costco')
    await makeItem('Milk')
    await makeItem('Eggs')

    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/search or create/i),
      ).toBeInTheDocument()
    })

    // When user types "mil"
    await user.type(screen.getByPlaceholderText(/search or create/i), 'mil')

    // Then only Milk is visible
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeInTheDocument()
      expect(screen.queryByLabelText('Eggs')).not.toBeInTheDocument()
    })
  })

  it('user can assign this vendor to an item by clicking the checkbox', async () => {
    // Given a vendor and an unassigned item
    const vendor = await createVendor('Costco')
    const item = await makeItem('Milk')

    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    // When user clicks the checkbox
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Milk'))

    // Then the item now has this vendor assigned in the DB
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.vendorIds).toContain(vendor.id)
    })
  })

  it('user can remove this vendor from an item by clicking the checkbox', async () => {
    // Given a vendor already assigned to an item
    const vendor = await createVendor('Costco')
    const item = await makeItem('Milk', [vendor.id])

    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    // When user unchecks the item
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeChecked()
    })
    await user.click(screen.getByLabelText('Milk'))

    // Then the vendor is removed from the item in the DB
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.vendorIds ?? []).not.toContain(vendor.id)
    })
  })

  it('user can create an item by typing a name and pressing Enter', async () => {
    // Given a vendor with no items matching "Butter"
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/search or create/i),
      ).toBeInTheDocument()
    })

    // When user types "Butter" into the search input (zero matches) and presses Enter
    await user.type(screen.getByPlaceholderText(/search or create/i), 'Butter')
    await user.keyboard('{Enter}')

    // Then the new item appears in the list checked (assigned to the vendor)
    await waitFor(() => {
      expect(screen.getByLabelText('Butter')).toBeChecked()
    })

    await waitFor(async () => {
      const items = await db.items.toArray()
      const butter = items.find((i) => i.name === 'Butter')
      expect(butter?.vendorIds).toContain(vendor.id)
    })
  })

  it('user sees a create row only when search has text and zero items match', async () => {
    // Given a vendor with one item
    const vendor = await createVendor('Costco')
    await makeItem('Milk')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/search or create/i),
      ).toBeInTheDocument()
    })

    // When user types text that matches no items
    await user.type(screen.getByPlaceholderText(/search or create/i), 'xyz')

    // Then the create row is visible
    await waitFor(() => {
      expect(screen.getByText(/create "xyz"/i)).toBeInTheDocument()
    })

    // When user clears the input and types text that matches an item
    await user.clear(screen.getByPlaceholderText(/search or create/i))
    await user.type(screen.getByPlaceholderText(/search or create/i), 'mil')

    // Then the create row is not shown (Milk matched)
    await waitFor(() => {
      expect(screen.queryByText(/create/i)).not.toBeInTheDocument()
      expect(screen.getByLabelText('Milk')).toBeInTheDocument()
    })
  })

  it('user can create an item by clicking the create row', async () => {
    // Given a vendor with no items matching "Butter"
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/search or create/i),
      ).toBeInTheDocument()
    })

    // When user types "Butter" and clicks the create row
    await user.type(screen.getByPlaceholderText(/search or create/i), 'Butter')
    await waitFor(() => {
      expect(screen.getByText(/create "Butter"/i)).toBeInTheDocument()
    })
    await user.click(screen.getByText(/create "Butter"/i))

    // Then Butter appears in the list checked and the input is cleared
    await waitFor(() => {
      expect(screen.getByLabelText('Butter')).toBeChecked()
      expect(screen.getByPlaceholderText(/search or create/i)).toHaveValue('')
    })
  })

  it('user can clear the search by pressing Escape', async () => {
    // Given a vendor and the search input has text
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/search or create/i),
      ).toBeInTheDocument()
    })
    await user.type(screen.getByPlaceholderText(/search or create/i), 'xyz')

    // When user presses Escape
    await user.keyboard('{Escape}')

    // Then the input is cleared
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search or create/i)).toHaveValue('')
    })
  })

  it('user does not see the New button', async () => {
    // Given a vendor
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)

    // Then no New button is present
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /new/i }),
      ).not.toBeInTheDocument()
    })
  })
})

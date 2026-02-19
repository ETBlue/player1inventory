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
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })

    // When user types "mil"
    await user.type(screen.getByPlaceholderText(/search items/i), 'mil')

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

  it('user can see a New button', async () => {
    // Given a vendor
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)

    // Then a New button is visible
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
    })
  })

  it('user can open the inline input by clicking New', async () => {
    // Given a vendor
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
    })

    // When user clicks New
    await user.click(screen.getByRole('button', { name: /new/i }))

    // Then an inline input appears
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/item name/i)).toBeInTheDocument()
    })
  })

  it('user can create an item by typing a name and pressing Enter', async () => {
    // Given a vendor
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
    })

    // When user opens inline input, types a name, and presses Enter
    await user.click(screen.getByRole('button', { name: /new/i }))
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/item name/i)).toBeInTheDocument()
    })
    await user.type(screen.getByPlaceholderText(/item name/i), 'Butter')
    await user.keyboard('{Enter}')

    // Then the new item appears in the list checked (assigned to vendor)
    await waitFor(() => {
      expect(screen.getByLabelText('Butter')).toBeChecked()
    })

    const items = await db.items.toArray()
    const butter = items.find((i) => i.name === 'Butter')
    expect(butter?.vendorIds).toContain(vendor.id)
  })

  it('user can cancel inline creation by pressing Escape', async () => {
    // Given a vendor with the inline input open
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /new/i }))
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/item name/i)).toBeInTheDocument()
    })

    // When user presses Escape
    await user.keyboard('{Escape}')

    // Then the inline input closes and no item was created
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText(/item name/i),
      ).not.toBeInTheDocument()
    })
    const items = await db.items.toArray()
    expect(items).toHaveLength(0)
  })

  it('user cannot submit inline creation when the item name is empty', async () => {
    // Given a vendor
    const vendor = await createVendor('Costco')
    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
    })

    // When user opens the inline input without typing
    await user.click(screen.getByRole('button', { name: /new/i }))

    // Then the Add item button is disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add item/i })).toBeDisabled()
    })
  })
})

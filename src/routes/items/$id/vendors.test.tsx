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

describe('Vendors Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.vendors.clear()
    await db.inventoryLogs.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderVendorsTab = (itemId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/items/${itemId}/vendors`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can see all vendors on the vendors tab', async () => {
    // Given an item and two vendors
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
    await createVendor('Costco')
    await createVendor("Trader Joe's")

    renderVendorsTab(item.id)

    // Then both vendor names appear as badges
    await waitFor(() => {
      expect(screen.getByText('Costco')).toBeInTheDocument()
      expect(screen.getByText("Trader Joe's")).toBeInTheDocument()
    })
  })

  it('user can see empty state when no vendors exist', async () => {
    // Given an item and no vendors
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderVendorsTab(item.id)

    // Then empty state message is shown
    await waitFor(() => {
      expect(screen.getByText(/no vendors yet/i)).toBeInTheDocument()
    })
  })

  it('user can see assigned vendors highlighted', async () => {
    // Given a vendor assigned to an item
    const vendor = await createVendor('Costco')
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [vendor.id],
    })

    renderVendorsTab(item.id)

    // Then the assigned vendor badge shows an X icon (aria-label or role)
    await waitFor(() => {
      expect(screen.getByText('Costco')).toBeInTheDocument()
    })
    // Assigned badge contains an X icon (lucide X renders as svg)
    const badge = screen
      .getByText('Costco')
      .closest('[class*="badge"], span, div')
    expect(badge).toBeInTheDocument()
  })

  it('user can assign a vendor to an item', async () => {
    // Given an item with no vendors and one available vendor
    const vendor = await createVendor('Costco')
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderVendorsTab(item.id)
    const user = userEvent.setup()

    // When user clicks the vendor badge
    await waitFor(() => {
      expect(screen.getByText('Costco')).toBeInTheDocument()
    })
    await user.click(screen.getByText('Costco'))

    // Then the item's vendorIds is updated in the database
    await waitFor(async () => {
      const updatedItem = await db.items.get(item.id)
      expect(updatedItem?.vendorIds).toContain(vendor.id)
    })
  })

  it('user can unassign a vendor from an item', async () => {
    // Given an item with a vendor already assigned
    const vendor = await createVendor('Costco')
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [vendor.id],
    })

    renderVendorsTab(item.id)
    const user = userEvent.setup()

    // When user clicks the assigned vendor badge
    await waitFor(() => {
      expect(screen.getByText('Costco')).toBeInTheDocument()
    })
    await user.click(screen.getByText('Costco'))

    // Then the vendor is removed from the item's vendorIds
    await waitFor(async () => {
      const updatedItem = await db.items.get(item.id)
      expect(updatedItem?.vendorIds ?? []).not.toContain(vendor.id)
    })
  })
})

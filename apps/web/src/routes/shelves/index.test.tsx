import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createItem, createShelf, updateShelf } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('ShelvesPage stock counts', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.shelves.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderShelvesPage = () => {
    const history = createMemoryHistory({ initialEntries: ['/shelves'] })
    const router = createRouter({
      routeTree,
      history,
      context: { queryClient },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  const makeActiveItem = (
    name: string,
    packedQuantity: number,
    refillThreshold = 1,
  ) =>
    createItem({
      name,
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold,
      packedQuantity,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

  const makeInactiveItem = (name: string, packedQuantity: number) =>
    createItem({
      name,
      targetUnit: 'package',
      targetQuantity: 0, // inactive: targetQuantity === 0
      refillThreshold: 1,
      packedQuantity,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

  describe('selection shelf out-of-stock count', () => {
    it('user can see out-of-stock count that excludes inactive items', async () => {
      // Given a selection shelf with one active out-of-stock item and one inactive item (qty=0)
      const shelf = await createShelf({
        name: 'Test Shelf',
        type: 'selection',
        order: 0,
        itemIds: [],
      })
      const activeItem = await makeActiveItem('Milk', 0) // out of stock
      const inactiveItem = await makeInactiveItem('Archived Juice', 0) // inactive + qty=0

      await updateShelf(shelf.id, { itemIds: [activeItem.id, inactiveItem.id] })

      // When the page renders
      renderShelvesPage()

      // Then the out-of-stock badge shows 1 (not 2) — inactive item is excluded
      await waitFor(() => {
        expect(screen.getByText('1 out of stock')).toBeInTheDocument()
      })
    })

    it('user can see out-of-stock count that still includes active items at zero', async () => {
      // Given a selection shelf with two active out-of-stock items
      const shelf = await createShelf({
        name: 'Test Shelf',
        type: 'selection',
        order: 0,
        itemIds: [],
      })
      const item1 = await makeActiveItem('Milk', 0)
      const item2 = await makeActiveItem('Eggs', 0)

      await updateShelf(shelf.id, { itemIds: [item1.id, item2.id] })

      // When the page renders
      renderShelvesPage()

      // Then the out-of-stock badge shows 2 — both active zero-qty items counted
      await waitFor(() => {
        expect(screen.getByText('2 out of stock')).toBeInTheDocument()
      })
    })
  })

  describe('selection shelf low-stock count', () => {
    it('user can see low-stock count that excludes inactive items', async () => {
      // Given a selection shelf with one active low-stock item and one inactive low-stock item
      const shelf = await createShelf({
        name: 'Test Shelf',
        type: 'selection',
        order: 0,
        itemIds: [],
      })
      const activeItem = await makeActiveItem('Milk', 1, 2) // qty=1 <= refillThreshold=2 → low stock
      const inactiveItem = await makeInactiveItem('Archived Juice', 0) // inactive (targetQuantity=0)

      await updateShelf(shelf.id, { itemIds: [activeItem.id, inactiveItem.id] })

      // When the page renders
      renderShelvesPage()

      // Then the low-stock badge shows 1 (not 2) — inactive item is excluded
      await waitFor(() => {
        expect(screen.getByText('1 low stock')).toBeInTheDocument()
      })
    })

    it('user can see low-stock count that still includes active low-stock items', async () => {
      // Given a selection shelf with two active low-stock items
      const shelf = await createShelf({
        name: 'Test Shelf',
        type: 'selection',
        order: 0,
        itemIds: [],
      })
      const item1 = await makeActiveItem('Milk', 1, 2) // qty=1 <= refillThreshold=2
      const item2 = await makeActiveItem('Eggs', 1, 2)

      await updateShelf(shelf.id, { itemIds: [item1.id, item2.id] })

      // When the page renders
      renderShelvesPage()

      // Then the low-stock badge shows 2
      await waitFor(() => {
        expect(screen.getByText('2 low stock')).toBeInTheDocument()
      })
    })
  })

  describe('unsorted shelf out-of-stock count', () => {
    it('user can see unsorted out-of-stock count that excludes inactive items', async () => {
      // Given no shelves configured (so all items are unsorted)
      const activeItem = await makeActiveItem('Milk', 0) // out of stock
      const inactiveItem = await makeInactiveItem('Archived Juice', 0) // inactive + qty=0

      // Suppress unused variable warnings — items exist in DB but aren't added to any shelf
      void activeItem
      void inactiveItem

      // When the page renders
      renderShelvesPage()

      // Then the out-of-stock badge on the Unsorted shelf shows 1 (not 2)
      await waitFor(() => {
        expect(screen.getByText('1 out of stock')).toBeInTheDocument()
      })
    })
  })

  describe('unsorted shelf low-stock count', () => {
    it('user can see unsorted low-stock count that excludes inactive items', async () => {
      // Given no shelves configured (so all items are unsorted)
      const activeItem = await makeActiveItem('Milk', 1, 2) // qty=1 <= refillThreshold=2
      const inactiveItem = await makeInactiveItem('Archived Juice', 0) // inactive

      void activeItem
      void inactiveItem

      // When the page renders
      renderShelvesPage()

      // Then the low-stock badge on the Unsorted shelf shows 1 (not 2)
      await waitFor(() => {
        expect(screen.getByText('1 low stock')).toBeInTheDocument()
      })
    })
  })
})

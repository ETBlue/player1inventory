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
    it('user can see out-of-stock count that excludes inactive', async () => {
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

    it('user can see out-of-stock count that still includes active at zero', async () => {
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

    it('user can see out-of-stock count that includes active with qty < refillThreshold', async () => {
      // Given a selection shelf where one item has qty=1 and threshold=3 (renders red, not yellow)
      const shelf = await createShelf({
        name: 'Test Shelf',
        type: 'selection',
        order: 0,
        itemIds: [],
      })
      // qty=0, threshold=3 → out of stock (qty < threshold)
      const item1 = await makeActiveItem('Milk', 0, 3)
      // qty=1, threshold=3 → also out of stock (qty < threshold), NOT low stock
      const item2 = await makeActiveItem('Eggs', 1, 3)

      await updateShelf(shelf.id, { itemIds: [item1.id, item2.id] })

      // When the page renders
      renderShelvesPage()

      // Then both items count as out-of-stock (qty < threshold)
      await waitFor(() => {
        expect(screen.getByText('2 out of stock')).toBeInTheDocument()
      })
    })
  })

  describe('selection shelf low-stock count', () => {
    it('user can see low-stock count that excludes inactive', async () => {
      // Given a selection shelf with one active low-stock item and one inactive item
      const shelf = await createShelf({
        name: 'Test Shelf',
        type: 'selection',
        order: 0,
        itemIds: [],
      })
      // qty=2, threshold=2 → low stock (qty === threshold > 0, renders yellow)
      const activeItem = await makeActiveItem('Milk', 2, 2)
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
      // qty=2, threshold=2 → low stock (qty === threshold > 0, renders yellow)
      const item1 = await makeActiveItem('Milk', 2, 2)
      const item2 = await makeActiveItem('Eggs', 2, 2)

      await updateShelf(shelf.id, { itemIds: [item1.id, item2.id] })

      // When the page renders
      renderShelvesPage()

      // Then the low-stock badge shows 2
      await waitFor(() => {
        expect(screen.getByText('2 low stock')).toBeInTheDocument()
      })
    })

    it('user can see that items with qty < refillThreshold are counted as out-of-stock, not low-stock', async () => {
      // Given a selection shelf where one item renders red (qty < threshold) and one renders yellow (qty === threshold)
      const shelf = await createShelf({
        name: 'Test Shelf',
        type: 'selection',
        order: 0,
        itemIds: [],
      })
      // qty=1, threshold=3 → out of stock (qty < threshold, renders red)
      const outItem = await makeActiveItem('Milk', 1, 3)
      // qty=3, threshold=3 → low stock (qty === threshold > 0, renders yellow)
      const lowItem = await makeActiveItem('Eggs', 3, 3)

      await updateShelf(shelf.id, { itemIds: [outItem.id, lowItem.id] })

      // When the page renders
      renderShelvesPage()

      // Then out-of-stock badge = 1 (only the red item), low-stock badge = 1 (only the yellow item)
      await waitFor(() => {
        expect(screen.getByText('1 out of stock')).toBeInTheDocument()
        expect(screen.getByText('1 low stock')).toBeInTheDocument()
      })
    })
  })

  describe('unsorted shelf out-of-stock count', () => {
    it('user can see unsorted out-of-stock count that excludes inactive', async () => {
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

    it('user can see unsorted out-of-stock count that includes items with qty < refillThreshold', async () => {
      // Given no shelves configured (so all items are unsorted)
      // qty=0, threshold=3 → out of stock
      const item1 = await makeActiveItem('Milk', 0, 3)
      // qty=1, threshold=3 → also out of stock (qty < threshold), NOT low stock
      const item2 = await makeActiveItem('Eggs', 1, 3)

      void item1
      void item2

      // When the page renders
      renderShelvesPage()

      // Then the out-of-stock badge shows 2 (both items are red)
      await waitFor(() => {
        expect(screen.getByText('2 out of stock')).toBeInTheDocument()
      })
    })
  })

  describe('unsorted shelf low-stock count', () => {
    it('user can see unsorted low-stock count that excludes inactive', async () => {
      // Given no shelves configured (so all items are unsorted)
      // qty=2, threshold=2 → low stock (qty === threshold > 0, renders yellow)
      const activeItem = await makeActiveItem('Milk', 2, 2)
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

    it('user can see that unsorted items with qty < refillThreshold count as out-of-stock, not low-stock', async () => {
      // Given no shelves configured (so all items are unsorted)
      // qty=1, threshold=3 → out of stock (qty < threshold, renders red)
      const outItem = await makeActiveItem('Milk', 1, 3)
      // qty=3, threshold=3 → low stock (qty === threshold > 0, renders yellow)
      const lowItem = await makeActiveItem('Eggs', 3, 3)

      void outItem
      void lowItem

      // When the page renders
      renderShelvesPage()

      // Then out-of-stock = 1 (red item only), low-stock = 1 (yellow item only)
      await waitFor(() => {
        expect(screen.getByText('1 out of stock')).toBeInTheDocument()
        expect(screen.getByText('1 low stock')).toBeInTheDocument()
      })
    })
  })

  describe('selection shelf active/inactive count', () => {
    it('user can see "X of Z active" when all items are active', async () => {
      // Given a selection shelf with 3 active (targetQuantity > 0)
      const shelf = await createShelf({
        name: 'Test Shelf',
        type: 'selection',
        order: 0,
        itemIds: [],
      })
      const item1 = await makeActiveItem('Milk', 2)
      const item2 = await makeActiveItem('Eggs', 1)
      const item3 = await makeActiveItem('Bread', 3)

      await updateShelf(shelf.id, { itemIds: [item1.id, item2.id, item3.id] })

      // When the page renders
      renderShelvesPage()

      // Then "3 of 3 active" is shown
      await waitFor(() => {
        expect(screen.getByText('3 of 3 active')).toBeInTheDocument()
      })
    })

    it('user can see "X of Z active" when some items are inactive', async () => {
      // Given a selection shelf with 3 active and 2 inactive
      const shelf = await createShelf({
        name: 'Test Shelf',
        type: 'selection',
        order: 0,
        itemIds: [],
      })
      const item1 = await makeActiveItem('Milk', 2)
      const item2 = await makeActiveItem('Eggs', 1)
      const item3 = await makeActiveItem('Bread', 3)
      const item4 = await makeInactiveItem('Archived Juice', 0)
      const item5 = await makeInactiveItem('Old Cereal', 1)

      await updateShelf(shelf.id, {
        itemIds: [item1.id, item2.id, item3.id, item4.id, item5.id],
      })

      // When the page renders
      renderShelvesPage()

      // Then "3 of 5 active" is shown (3 active out of 5 total)
      await waitFor(() => {
        expect(screen.getByText('3 of 5 active')).toBeInTheDocument()
      })
    })
  })

  describe('unsorted shelf active/inactive count', () => {
    it('user can see "X of Z active" for unsorted when all items are active', async () => {
      // Given no shelves configured (all items unsorted), 2 active
      const item1 = await makeActiveItem('Milk', 2)
      const item2 = await makeActiveItem('Eggs', 1)

      void item1
      void item2

      // When the page renders
      renderShelvesPage()

      // Then "2 of 2 active" is shown on the Unsorted shelf
      await waitFor(() => {
        expect(screen.getByText('2 of 2 active')).toBeInTheDocument()
      })
    })

    it('user can see "X of Z active" for unsorted when some items are inactive', async () => {
      // Given no shelves configured (all items unsorted), 2 active + 1 inactive
      const item1 = await makeActiveItem('Milk', 2)
      const item2 = await makeActiveItem('Eggs', 1)
      const item3 = await makeInactiveItem('Archived Juice', 0)

      void item1
      void item2
      void item3

      // When the page renders
      renderShelvesPage()

      // Then "2 of 3 active" is shown on the Unsorted shelf (2 active out of 3 total)
      await waitFor(() => {
        expect(screen.getByText('2 of 3 active')).toBeInTheDocument()
      })
    })
  })
})

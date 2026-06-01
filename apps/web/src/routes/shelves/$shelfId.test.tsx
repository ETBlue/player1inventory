import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { createItem, createShelf, updateShelf } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('ShelfDetailPage - ItemCard loading states', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.shelves.clear()
    await db.inventoryLogs.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const makeItem = (name: string, packedQuantity = 2) =>
    createItem({
      name,
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

  const renderShelfDetailPage = (shelfId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/shelves/${shelfId}`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user sees spinner on calculator button while mutation is pending (shelf pantry mode)', async () => {
    // Given a selection shelf with one item
    const shelf = await createShelf({
      name: 'Test Shelf',
      type: 'selection',
      order: 0,
      itemIds: [],
    })
    const item = await makeItem('Milk')
    await updateShelf(shelf.id, { itemIds: [item.id] })

    // Spy on the db write to introduce a delay, keeping pendingItemIds populated
    let resolveUpdate!: () => void
    const originalUpdate = db.items.update.bind(db.items)
    const updateSpy = vi.spyOn(db.items, 'update').mockImplementationOnce(
      (key, changes) =>
        new Promise((resolve) => {
          resolveUpdate = () =>
            resolve(originalUpdate(key, changes) as unknown as number)
        }) as ReturnType<typeof db.items.update>,
    )

    renderShelfDetailPage(shelf.id)
    const user = userEvent.setup()

    // When user waits for the calculator button and opens the dialog
    await waitFor(() => {
      expect(
        screen.getByLabelText('Update quantity of Milk'),
      ).toBeInTheDocument()
    })
    const calcBtn = screen.getByLabelText('Update quantity of Milk')
    await user.click(calcBtn)

    // Then the dialog opens — modify a value to enable Update, then click it
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Increase unpacked' }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Increase unpacked' }))

    const updateBtn = screen.getByRole('button', { name: /^update$/i })
    await user.click(updateBtn)

    // Then a spinner appears inside the calculator button (pendingItemIds still has item.id)
    await waitFor(() => {
      expect(calcBtn.querySelector('.animate-spin')).toBeInTheDocument()
    })

    // Cleanup: let the mutation complete and restore the spy
    resolveUpdate()
    updateSpy.mockRestore()
    await act(async () => {
      await Promise.resolve()
    })
  })
})

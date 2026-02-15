// src/routes/items/$id.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createItem } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Item detail page - manual quantity input', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderItemDetailPage = (itemId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/items/${itemId}`],
    })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can manually set packed quantity', async () => {
    const user = userEvent.setup()

    // Given an item with initial quantities
    const item = await createItem({
      name: 'Test Item',
      packageUnit: 'pack',
      targetUnit: 'package',
      targetQuantity: 5,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    // When user opens item detail page
    await waitFor(() => {
      expect(screen.getByLabelText(/^packed quantity$/i)).toBeInTheDocument()
    })

    // Initial value should be 2
    const packedInput = screen.getByLabelText(
      /^packed quantity$/i,
    ) as HTMLInputElement
    expect(packedInput.value).toBe('2')

    // When user changes packed quantity to 5
    await user.clear(packedInput)
    await user.type(packedInput, '5')

    // And saves the form
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then item is updated in database
    await waitFor(async () => {
      const updatedItem = await db.items.get(item.id)
      expect(updatedItem?.packedQuantity).toBe(5)
    })

    // And no inventory log is created
    const logs = await db.inventoryLogs
      .where('itemId')
      .equals(item.id)
      .toArray()
    expect(logs).toHaveLength(0)
  })

  it('user can manually set unpacked quantity for dual-unit items', async () => {
    const user = userEvent.setup()

    // Given a dual-unit item
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      targetQuantity: 5,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 0.25,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/unpacked quantity/i)).toBeInTheDocument()
    })

    // When user sets unpacked quantity to 0.5
    const unpackedInput = screen.getByLabelText(/unpacked quantity/i)
    await user.clear(unpackedInput)
    await user.type(unpackedInput, '0.5')

    // And saves the form
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then item is updated in database
    await waitFor(async () => {
      const updatedItem = await db.items.get(item.id)
      expect(updatedItem?.unpackedQuantity).toBe(0.5)
    })
  })

  it('shows unpacked quantity field only for dual-unit items', async () => {
    // Given a dual-unit item
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      targetQuantity: 5,
      refillThreshold: 2,
      packedQuantity: 3,
      unpackedQuantity: 0,
      consumeAmount: 0.25,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/^packed quantity$/i)).toBeInTheDocument()
    })

    // Unpacked field should be visible for dual-unit items
    expect(screen.getByLabelText(/^unpacked quantity$/i)).toBeInTheDocument()
  })
})

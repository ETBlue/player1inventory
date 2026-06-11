// src/routes/items/$id/stock.test.tsx
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

describe('Item stock tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.recipes.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderStockTab = (itemId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/items/${itemId}/stock`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can edit and save stock fields on the stock tab', async () => {
    const user = userEvent.setup()

    // Given an item
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'bottle',
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderStockTab(item.id)

    // When the user changes the packed quantity and saves
    await waitFor(() => {
      expect(screen.getByLabelText(/^packed/i)).toBeInTheDocument()
    })
    const packedInput = screen.getByLabelText(/^packed/i)
    await user.clear(packedInput)
    await user.type(packedInput, '5')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the stock field is persisted
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.packedQuantity).toBe(5)
    })
  })

  it('saving stock does not clear existing info fields (name/note/wikidata)', async () => {
    const user = userEvent.setup()

    // Given an item with info fields populated
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'bottle',
      wikidataUrl: 'https://www.wikidata.org/wiki/Q8495',
      note: 'Lactose-free preferred',
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderStockTab(item.id)

    // When the user edits a stock field and saves (the stock tab payload omits
    // name/wikidataUrl/note, so they must survive untouched)
    await waitFor(() => {
      expect(screen.getByLabelText(/^packed/i)).toBeInTheDocument()
    })
    const packedInput = screen.getByLabelText(/^packed/i)
    await user.clear(packedInput)
    await user.type(packedInput, '3')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the info fields remain intact
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.packedQuantity).toBe(3)
      expect(updated?.name).toBe('Milk')
      expect(updated?.wikidataUrl).toBe('https://www.wikidata.org/wiki/Q8495')
      expect(updated?.note).toBe('Lactose-free preferred')
    })
  })
})

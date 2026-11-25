import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createItem } from '@/db/operations'
import { useItemLogs } from './useInventoryLogs'
import { useUpdateItem } from './useItems'

// Local mode (design 2026-11-25, inventory log layout). The Stock tab Save and
// Quick update both call `useUpdateItem`, and local `updateItem` writes the
// stock count row. A Log tab already open must show it after the save, which
// needs `useUpdateItem`'s `['items']` invalidation to reach `useItemLogs`'s
// key, `['items', id, 'logs', …]`.

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('a manual save and the Log tab (local)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.delete()
  })

  it('user sees a stock count row in the item log after a quick update', async () => {
    // Given an item with 2 packs and its log open
    const item = await createItem({
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 0,
    })
    const { result } = renderHook(
      () => ({ update: useUpdateItem(), logs: useItemLogs(item.id) }),
      { wrapper: wrapper() },
    )
    await waitFor(() => expect(result.current.logs.data).toEqual([]))

    // When the user saves 1 pack, as Quick update does
    await act(async () => {
      await result.current.update.mutateAsync({
        id: item.id,
        updates: { packedQuantity: 1, unpackedQuantity: 0 },
      })
    })

    // Then the open log shows one stock count row: −1, 1 after
    await waitFor(() =>
      expect(result.current.logs.data).toMatchObject([
        { logKey: 'stockCount', delta: -1, quantity: 1 },
      ]),
    )
  })
})

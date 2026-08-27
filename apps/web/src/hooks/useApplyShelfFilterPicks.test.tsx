import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { createItem } from '@/db/operations'
import { useApplyShelfFilterPicks } from './useApplyShelfFilterPicks'
import { useItems } from './useItems'

// A gate on `getAllItems` — the queryFn behind `useItems()`'s `['items']` key,
// which `useApplyShelfFilterPicks`'s `onSuccess` invalidates. Holding a
// REFETCH open (the gate stays off until the test turns it on, so the initial
// load is untouched) is what makes "the invalidation has not landed yet" an
// observable state — mirrors the `shelfGate` technique in
// `ShelfDetailView.test.tsx` (see `hooks/CLAUDE.md`).
const itemsGate = { hold: false, release: null as null | (() => void) }

vi.mock('@/db/operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/operations')>()
  return {
    ...actual,
    getAllItems: vi.fn(
      async (...args: Parameters<typeof actual.getAllItems>) => {
        if (itemsGate.hold) {
          await new Promise<void>((resolve) => {
            itemsGate.release = resolve
          })
        }
        return actual.getAllItems(...args)
      },
    ),
  }
})

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

// The gate is module-level shared state, so a test that finishes with `hold`
// still true would hang the NEXT test's first `getAllItems` call.
afterEach(async () => {
  itemsGate.hold = false
  itemsGate.release?.()
  itemsGate.release = null
  localStorage.clear()
  vi.clearAllMocks()
  await db.items.clear()
})

describe('useApplyShelfFilterPicks (local mode)', () => {
  it('mutateAsync resolves only after the invalidated queries refetch', async () => {
    // Given a real item (applyShelfFilterPicksBatch re-reads it inside its own
    // transaction, so it must actually exist in Dexie), and an active
    // `useItems()` reader sharing the QueryClient so the ['items']
    // invalidation actually triggers a refetch rather than a no-op against no
    // subscribers
    const item = await createItem({ name: 'Milk', tagIds: [] })
    const wrapper = createWrapper()
    const { result } = renderHook(
      () => ({
        apply: useApplyShelfFilterPicks(),
        items: useItems(),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.items.data).toBeDefined())

    // When the picks are applied, with the refetch held open
    itemsGate.hold = true
    let settled = false
    const pending = result.current.apply
      .mutateAsync({ item, addTagIds: ['frozen'], addVendorIds: [] })
      .then(() => {
        settled = true
      })

    // Then it has NOT resolved while the refetch is still in flight
    await waitFor(() => expect(itemsGate.release).not.toBeNull())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(settled).toBe(false)

    // And it resolves once the refetch lands
    await act(async () => {
      itemsGate.release?.()
      await pending
    })
    expect(settled).toBe(true)
  })
})

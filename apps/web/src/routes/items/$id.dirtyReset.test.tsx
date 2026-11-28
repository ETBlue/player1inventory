// The item layout empties the dirty state when the tab changes
// (`routes/items/$id.tsx`, the effect on `currentPath`). Item relations Save,
// design `docs/features/items/2026-11-27-item-relations-save-design.md`.
//
// Why a fake tab: the two tests in `$id.tabs.test.tsx` pass WITHOUT that
// effect, because `ItemForm` mounts once more under the new path and reports
// `false` first. This file replaces the Tags tab with a tab that registers
// `dirty: true` and never reports `false` when it unmounts, which is what
// `ItemForm` does. So only the layout's effect can clear the state here.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { createItem } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

vi.mock('@/routes/items/$id/tags', async () => {
  const { createFileRoute } = await import('@tanstack/react-router')
  const { useItemLayout } = await import('@/hooks/useItemLayout')
  function ForgetfulTab() {
    const { registerDirtyState } = useItemLayout()
    // Registers `true` on a press, and nothing on unmount
    return (
      <button type="button" onClick={() => registerDirtyState(true)}>
        Make a change
      </button>
    )
  }
  return {
    Route: createFileRoute('/items/$id/tags')({ component: ForgetfulTab }),
  }
})

describe(
  'Item page - the dirty state of a tab that is gone',
  {
    timeout: 15_000,
  },
  () => {
    let queryClient: QueryClient
    let itemId: string

    beforeEach(async () => {
      await db.items.clear()
      await db.itemStocks.clear()
      sessionStorage.clear()
      queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      const item = await createItem({
        name: 'Milk',
        targetUnit: 'package',
        consumeAmount: 1,
        tagIds: [],
      })
      itemId = item.id
    })

    it('user who discards a change on a tab can leave the next tab with no dialog', async () => {
      const user = userEvent.setup()
      const history = createMemoryHistory({
        initialEntries: [`/items/${itemId}/tags`],
      })
      const router = createRouter({ routeTree, history })
      render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      )
      const row = within(
        await screen.findByRole('navigation', { name: 'Item sections' }),
      )

      // Given a change on a tab that does not report `false` when it goes
      await user.click(
        await screen.findByRole('button', { name: 'Make a change' }),
      )
      // And the change is discarded on the way to Vendors
      await user.click(row.getByRole('link', { name: 'Vendors' }))
      const dialog = await screen.findByRole('alertdialog', {
        name: 'Unsaved changes',
      })
      await user.click(within(dialog).getByRole('button', { name: 'Discard' }))
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(`/items/${itemId}/vendors`),
      )
      await waitFor(() =>
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
      )

      // When the user opens the Log tab from Vendors (a guarded tab)
      await user.click(row.getByRole('link', { name: 'Log' }))

      // Then the page moves with no dialog: nothing on Vendors is unsaved
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(`/items/${itemId}/log`),
      )
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  },
)

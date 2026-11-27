import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'
import {
  CLOUD_LOCATIONS,
  cloudItem,
  cloudStock,
  LOC_A,
} from '@/test/cloudFixtures'
import {
  cloudServer,
  resetCloudServer,
  seedCloudHousehold,
} from '@/test/cloudServerStub'

// The "Active here" switch in the pantry quick update dialog, in CLOUD mode
// (design `docs/features/items/2026-11-26-item-stock-active-design.md`,
// *The switch*). The dialog's own tests prove what it hands its caller; this
// file proves the switch reaches `upsertItemStock`'s variables through the
// pantry view and `useUpdateItem`.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const { stubGeneratedHooks } = await import('@/test/cloudServerStub')
  return stubGeneratedHooks(await importOriginal())
})

const FLOUR = cloudItem('item-flour', 'Flour')

describe('Pantry quick update - the Active here switch in cloud mode', () => {
  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    sessionStorage.clear()
    resetCloudServer()
    seedCloudHousehold(CLOUD_LOCATIONS)
    cloudServer.queries.useGetItemsQuery = { items: [FLOUR] }
    cloudServer.queries.useGetTagsQuery = { tags: [] }
    cloudServer.queries.useGetTagTypesQuery = { tagTypes: [] }
    cloudServer.queries.useGetVendorsQuery = { vendors: [] }
    cloudServer.queries.useGetRecipesQuery = { recipes: [] }
    cloudServer.queries.useGetShelvesQuery = { shelves: [] }
  })

  afterEach(() => {
    localStorage.removeItem('data-mode')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
  })

  // Flour at LOC_A with a target of 5, on or off. The target is the same in
  // both, so only the switch can make the two answers differ.
  function seedFlour(isActive: boolean) {
    cloudServer.queries.usePantryDataQuery = {
      items: [FLOUR],
      itemStocks: [
        cloudStock('stock-flour-a', 'item-flour', LOC_A, {
          targetQuantity: 5,
          refillThreshold: 2,
          packedQuantity: 1,
          unpackedQuantity: 0,
          isActive,
        }),
      ],
    }
  }

  function renderPantry() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      context: { queryClient },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  async function openDialog() {
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Update quantity of Flour' }),
    )
    const dialog = await screen.findByRole('dialog')
    return { user, dialog }
  }

  it('user can turn an item off in the quick update dialog, and the save sends the switch', async () => {
    // Given Flour, active, with a target of 5
    seedFlour(true)
    renderPantry()

    // When the user turns the switch off and presses Update
    const { user, dialog } = await openDialog()
    const activeSwitch = within(dialog).getByRole('switch', {
      name: 'Active here',
    })
    expect(activeSwitch).toBeChecked()
    await user.click(activeSwitch)
    await user.click(within(dialog).getByRole('button', { name: 'Update' }))

    // Then `upsertItemStock` carries `isActive: false` and the same target
    await waitFor(() =>
      expect(cloudServer.calls.useUpsertItemStockMutation).toHaveLength(1),
    )
    expect(cloudServer.calls.useUpsertItemStockMutation).toEqual([
      expect.objectContaining({
        itemId: 'item-flour',
        locationId: LOC_A,
        input: expect.objectContaining({
          isActive: false,
          targetQuantity: 5,
          refillThreshold: 2,
        }),
      }),
    ])
  })

  it('user can turn an inactive item on again in the quick update dialog', async () => {
    // Given Flour turned off here, with its target of 5 kept
    seedFlour(false)
    renderPantry()

    // When the user turns the switch on and presses Update
    const { user, dialog } = await openDialog()
    const activeSwitch = within(dialog).getByRole('switch', {
      name: 'Active here',
    })
    expect(activeSwitch).not.toBeChecked()
    await user.click(activeSwitch)
    await user.click(within(dialog).getByRole('button', { name: 'Update' }))

    // Then `upsertItemStock` carries `isActive: true` and the same target
    await waitFor(() =>
      expect(cloudServer.calls.useUpsertItemStockMutation).toHaveLength(1),
    )
    expect(cloudServer.calls.useUpsertItemStockMutation).toEqual([
      expect.objectContaining({
        input: expect.objectContaining({ isActive: true, targetQuantity: 5 }),
      }),
    ])
  })
})

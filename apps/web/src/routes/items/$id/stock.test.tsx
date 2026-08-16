// src/routes/items/$id/stock.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { createItem, getItemStock } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { DEFAULT_LOCATION_ID } from '@/types'

// Cloud-mode override for the "Important 1" regression test below: only
// useGetItemQuery and useUpdateItemMutation get test-controlled behavior.
// Every other hook keeps the exact same safe default stub used by the global
// mock in src/test/setup.ts (which this file-level vi.mock replaces for this
// file only) — this avoids letting the real, un-stubbed Apollo hooks run
// when ancestor routes (__root.tsx, $id.tsx) render alongside the stock tab.
const mockUseGetItemQuery = vi.fn(() => ({
  data: undefined,
  loading: false,
  error: undefined,
}))
const mockUseUpdateItemMutation = vi.fn(() => [
  vi.fn().mockResolvedValue({ data: undefined }),
  {},
])

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  const queryStub = () => ({
    data: undefined,
    loading: false,
    error: undefined,
  })
  const mutationStub = () => [
    vi.fn().mockResolvedValue({ data: undefined }),
    {},
  ]
  return {
    ...original,
    useGetItemQuery: (...args: unknown[]) => mockUseGetItemQuery(...args),
    useGetItemsQuery: queryStub,
    useCreateItemMutation: mutationStub,
    useUpdateItemMutation: (...args: unknown[]) =>
      mockUseUpdateItemMutation(...args),
    useDeleteItemMutation: mutationStub,
    useGetTagTypesQuery: queryStub,
    useGetTagsQuery: queryStub,
    useGetTagsByTypeQuery: queryStub,
    useCreateTagTypeMutation: mutationStub,
    useUpdateTagTypeMutation: mutationStub,
    useDeleteTagTypeMutation: mutationStub,
    useCreateTagMutation: mutationStub,
    useUpdateTagMutation: mutationStub,
    useDeleteTagMutation: mutationStub,
    useItemCountByTagQuery: queryStub,
    useTagCountByTypeQuery: queryStub,
    useGetVendorsQuery: queryStub,
    useCreateVendorMutation: mutationStub,
    useUpdateVendorMutation: mutationStub,
    useDeleteVendorMutation: mutationStub,
    useItemCountByVendorQuery: queryStub,
    useGetRecipesQuery: queryStub,
    useGetRecipeQuery: queryStub,
    useCreateRecipeMutation: mutationStub,
    useUpdateRecipeMutation: mutationStub,
    useDeleteRecipeMutation: mutationStub,
    useUpdateRecipeLastCookedAtMutation: mutationStub,
    useConsumeRecipesMutation: mutationStub,
    useItemCountByRecipeQuery: queryStub,
    useActiveCartQuery: queryStub,
    useCartItemsQuery: queryStub,
    useAddToCartMutation: mutationStub,
    useUpdateCartItemMutation: mutationStub,
    useRemoveFromCartMutation: mutationStub,
    useCheckoutMutation: mutationStub,
    useAbandonCartMutation: mutationStub,
    useVendorCartQuery: queryStub,
    useAllCartsQuery: queryStub,
    useAllCartItemsQuery: queryStub,
    useItemLogsQuery: queryStub,
    useInventoryLogCountByItemQuery: queryStub,
    useLastPurchaseDatesQuery: queryStub,
    useAddInventoryLogMutation: mutationStub,
    useGetShelvesQuery: queryStub,
    useGetShelfQuery: queryStub,
    useCreateShelfMutation: mutationStub,
    useUpdateShelfMutation: mutationStub,
    useDeleteShelfMutation: mutationStub,
    useReorderShelvesMutation: mutationStub,
    useReorderShelfItemsMutation: mutationStub,
  }
})

describe('Item stock tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.recipes.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    // Reset the cloud-mode Apollo overrides to safe defaults before every
    // test; the cloud-mode test below overrides them further for itself.
    mockUseGetItemQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    })
    mockUseUpdateItemMutation.mockReturnValue([
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ])
  })

  afterEach(() => {
    localStorage.removeItem('data-mode')
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

    // Then the stock field is persisted on the active-location ItemStock
    await waitFor(async () => {
      const stock = await getItemStock(item.id)
      expect(stock?.packedQuantity).toBe(5)
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

    // Then the stock change persists and the global info fields remain intact
    await waitFor(async () => {
      const stock = await getItemStock(item.id)
      expect(stock?.packedQuantity).toBe(3)
    })
    const updated = await db.items.get(item.id)
    expect(updated?.name).toBe('Milk')
    expect(updated?.wikidataUrl).toBe('https://www.wikidata.org/wiki/Q8495')
    expect(updated?.note).toBe('Lactose-free preferred')
  })

  it('confirms before implicitly stocking an item not yet in the active location', async () => {
    const user = userEvent.setup()

    // Given an item that is stocked elsewhere, but NOT in the active
    // (default) location — its stock tab loads with zeroed pre-filled values
    const item = await createItem(
      {
        name: 'Butter',
        packageUnit: 'block',
        targetUnit: 'package',
        targetQuantity: 4,
        refillThreshold: 2,
        packedQuantity: 2,
        unpackedQuantity: 0,
        consumeAmount: 1,
        tagIds: [],
      },
      'loc-other',
    )

    renderStockTab(item.id)

    // When the user edits a stock field and clicks Save
    await waitFor(() => {
      expect(screen.getByLabelText(/^packed/i)).toBeInTheDocument()
    })
    const packedInput = screen.getByLabelText(/^packed/i)
    await user.clear(packedInput)
    await user.type(packedInput, '5')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then a confirmation dialog appears instead of saving immediately —
    // no ItemStock row is created in the active location yet
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    expect(
      within(dialog).getByText('Add Butter to My Home?'),
    ).toBeInTheDocument()
    expect(await getItemStock(item.id, DEFAULT_LOCATION_ID)).toBeUndefined()

    // And confirming proceeds with the implicit stock-add
    await user.click(within(dialog).getByRole('button', { name: /add/i }))
    await waitFor(async () => {
      const stock = await getItemStock(item.id, DEFAULT_LOCATION_ID)
      expect(stock?.packedQuantity).toBe(5)
    })
  })

  it('cloud mode: saving persists directly without the stock-add confirmation', async () => {
    const user = userEvent.setup()

    // Given cloud mode is active and the item comes back from the cloud API
    // (cloud items never carry a stockId — ItemStock has no cloud backend
    // yet — so reading item.stockId === undefined must not be interpreted
    // as "not yet stocked in this location" while in cloud mode)
    localStorage.setItem('data-mode', 'cloud')
    const cloudItem = {
      id: 'item-cloud-1',
      name: 'Cloud Milk',
      packageUnit: 'bottle',
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    }
    mockUseGetItemQuery.mockReturnValue({
      data: { item: cloudItem },
      loading: false,
      error: undefined,
    })
    const mockCloudUpdate = vi.fn().mockResolvedValue({
      data: { updateItem: { ...cloudItem, packedQuantity: 5 } },
    })
    mockUseUpdateItemMutation.mockReturnValue([mockCloudUpdate, {}])

    renderStockTab(cloudItem.id)

    // When the user edits a stock field and clicks Save
    await waitFor(() => {
      expect(screen.getByLabelText(/^packed/i)).toBeInTheDocument()
    })
    const packedInput = screen.getByLabelText(/^packed/i)
    await user.clear(packedInput)
    await user.type(packedInput, '5')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the update is sent directly — no local-only "not yet stocked
    // here" confirmation dialog ever appears in cloud mode
    await waitFor(() => {
      expect(mockCloudUpdate).toHaveBeenCalled()
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

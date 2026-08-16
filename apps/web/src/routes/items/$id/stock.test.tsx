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
import {
  addInventoryLog,
  addItemToLocation,
  addToCart,
  createItem,
  createLocation,
  getItemStock,
  upsertItemStock,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { cartIdFor, DEFAULT_LOCATION_ID } from '@/types'

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
    await db.cartItems.clear()
    await db.shoppingCarts.clear()
    // Keep the undeletable default location ('My Home'); drop any extras a
    // previous test added.
    await db.locations.where('id').notEqual(DEFAULT_LOCATION_ID).delete()
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

  it('renders no pager chrome when there is only one location', async () => {
    // Given a single (default) location and an item stocked in it
    const item = await createItem({
      name: 'Milk',
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderStockTab(item.id)

    // When the stock tab loads
    await screen.findByLabelText(/^packed/i)

    // Then there is no pager to page with — a lone dot next to two dead
    // chevrons would just look like a broken carousel
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /next location/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /previous location/i }),
    ).not.toBeInTheDocument()
  })

  it('user can page from the active location to another location stock', async () => {
    const user = userEvent.setup()

    // Given an item stocked in two locations with different quantities
    const cabin = await createLocation('Cabin')
    const item = await createItem({
      name: 'Milk',
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
    await addItemToLocation(item.id, cabin.id)
    await upsertItemStock(item.id, cabin.id, { packedQuantity: 7 })

    renderStockTab(item.id)

    // Then the pager opens on the active location's stock
    await waitFor(() => {
      expect(screen.getByLabelText(/^packed/i)).toHaveValue(2)
    })
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(
      /my home/i,
    )

    // When the user pages to the other location
    await user.click(screen.getByRole('button', { name: /next location/i }))

    // Then that location's own stock is shown
    await waitFor(() => {
      expect(screen.getByLabelText(/^packed/i)).toHaveValue(7)
    })
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(
      /cabin/i,
    )
  })

  it('keeps the active location marked while the user views another one', async () => {
    const user = userEvent.setup()

    // Given two locations, the default one active
    const cabin = await createLocation('Cabin')
    const item = await createItem({ name: 'Milk', tagIds: [] })
    await addItemToLocation(item.id, cabin.id)

    renderStockTab(item.id)

    // Then the active location is named as such — not by colour alone
    const activeTab = await screen.findByRole('tab', {
      name: /my home.*active/i,
    })
    expect(activeTab).toHaveAttribute('aria-selected', 'true')

    // When the user pages away from it
    await user.click(screen.getByRole('tab', { name: 'Cabin' }))

    // Then the active marker stays on My Home even though Cabin is the page
    // being viewed
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Cabin' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })
    expect(
      screen.getByRole('tab', { name: /my home.*active/i }),
    ).toHaveAttribute('aria-selected', 'false')
  })

  it('user can move between location pages with the arrow keys', async () => {
    const user = userEvent.setup()

    // Given an item stocked in two locations
    const cabin = await createLocation('Cabin')
    const item = await createItem({ name: 'Milk', tagIds: [] })
    await addItemToLocation(item.id, cabin.id)

    renderStockTab(item.id)

    // When the user focuses the selected dot and presses ArrowRight
    const firstTab = await screen.findByRole('tab', { name: /my home/i })
    firstTab.focus()
    await user.keyboard('{ArrowRight}')

    // Then the next location is selected and focused
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Cabin' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })
    expect(screen.getByRole('tab', { name: 'Cabin' })).toHaveFocus()

    // And ArrowLeft brings the user back
    await user.keyboard('{ArrowLeft}')
    await waitFor(() => {
      expect(
        screen.getByRole('tab', { name: /my home.*active/i }),
      ).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('user can add the item to a location it is not stocked in', async () => {
    const user = userEvent.setup()

    // Given an item stocked only in the active location
    const cabin = await createLocation('Cabin')
    const item = await createItem({
      name: 'Butter',
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderStockTab(item.id)
    await screen.findByLabelText(/^packed/i)

    // When the user pages to the location it is not stocked in
    await user.click(screen.getByRole('tab', { name: 'Cabin' }))

    // Then there is no stock form to edit — an empty state and an explicit
    // "Add to location" call to action instead
    const addButton = await screen.findByRole('button', {
      name: /add to location/i,
    })
    expect(screen.queryByLabelText(/^packed/i)).not.toBeInTheDocument()
    expect(await getItemStock(item.id, cabin.id)).toBeUndefined()

    // And using it stocks the item there via copy-on-add (settings inherited,
    // quantities zeroed) and the page turns into the stock form
    await user.click(addButton)
    await waitFor(async () => {
      const stock = await getItemStock(item.id, cabin.id)
      expect(stock?.targetQuantity).toBe(4)
      expect(stock?.packedQuantity).toBe(0)
    })
    expect(await screen.findByLabelText(/^packed/i)).toHaveValue(0)
  })

  it('user can remove the item from the location being viewed after confirming', async () => {
    const user = userEvent.setup()

    // Given an item stocked in two locations, with a log and a cart entry in
    // the one the user is about to remove
    const cabin = await createLocation('Cabin')
    const item = await createItem({ name: 'Milk', tagIds: [] })
    await addItemToLocation(item.id, cabin.id)
    await addInventoryLog({
      itemId: item.id,
      locationId: cabin.id,
      delta: 1,
      quantity: 1,
      occurredAt: new Date(),
    })
    const cartId = cartIdFor(cabin.id, null)
    await db.shoppingCarts.put({ id: cartId })
    await addToCart(cartId, item.id, 1)

    renderStockTab(item.id)
    await screen.findByLabelText(/^packed/i)

    // When the user pages to that location and asks to remove it
    await user.click(screen.getByRole('tab', { name: 'Cabin' }))
    await user.click(
      await screen.findByRole('button', { name: /remove from location/i }),
    )

    // Then a confirmation names the item and the location, and spells out what
    // else is deleted — nothing has been deleted yet
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText('Remove Milk from Cabin?'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText(/inventory logs: 1/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/cart entries: 1/i)).toBeInTheDocument()
    expect(await getItemStock(item.id, cabin.id)).toBeDefined()

    // And confirming removes that location's stock and its cascade, leaving
    // the other location untouched
    await user.click(within(dialog).getByRole('button', { name: /remove/i }))
    await waitFor(async () => {
      expect(await getItemStock(item.id, cabin.id)).toBeUndefined()
    })
    expect(await getItemStock(item.id, DEFAULT_LOCATION_ID)).toBeDefined()
    expect(await db.items.get(item.id)).toBeDefined()
    // The page it was removed from turns into the not-stocked empty state
    expect(
      await screen.findByRole('button', { name: /add to location/i }),
    ).toBeInTheDocument()
  })

  it('cloud mode: renders a single stock page with no pager and no location actions', async () => {
    // Given cloud mode, several local locations, and a cloud item
    await createLocation('Cabin')
    localStorage.setItem('data-mode', 'cloud')
    const cloudItem = {
      id: 'item-cloud-2',
      name: 'Cloud Milk',
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

    renderStockTab(cloudItem.id)

    // Then the stock form renders on its own: cloud has no locations and no
    // ItemStock, so there is nothing to page over and nothing to add to or
    // remove from (both mutations throw in cloud mode by design)
    await screen.findByLabelText(/^packed/i)
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /next location/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /remove from location/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /add to location/i }),
    ).not.toBeInTheDocument()
  })

  it('cloud mode: saving persists directly without any location confirmation', async () => {
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

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
  createRecipe,
  getItemStock,
  getRecipes,
  upsertItemStock,
} from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { cartIdFor, DEFAULT_LOCATION_ID } from '@/types'

// The eight configuration fields that live on the global Item since v16 — no
// ItemStock row may carry them.
const GLOBAL_STOCK_KEYS = [
  'packageUnit',
  'measurementUnit',
  'amountPerPackage',
  'targetUnit',
  'consumeAmount',
  'estimatedDueDays',
  'expirationThreshold',
  'expirationMode',
] as const

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

  // The regression guard for commit 2fe372a1: `hasFieldError` gated the Stock
  // tab's Save on info-only fields this tab never renders, so an item whose
  // consumeAmount is 0 could not have its stock saved at all — no error text,
  // no field to fix it in. Independent of what `createItem` defaults to: 0 was
  // the create default when the bug was found (6302ee97) and is merely one way
  // to reach it, so the fixture now sets 0 EXPLICITLY. It must keep doing so —
  // dropping it would make this test create a consumeAmount-1 item and pin
  // nothing at all.
  it('user can save stock for an item whose consume amount is 0', async () => {
    const user = userEvent.setup()

    // Given an item whose consumeAmount is 0 — explicitly set here, but equally
    // reachable via an import or an item created while 0 was the default
    const item = await createItem({
      name: 'Milk',
      tagIds: [],
      consumeAmount: 0,
    })
    expect((await db.items.get(item.id))?.consumeAmount).toBe(0)

    renderStockTab(item.id)

    // When the user types a new packed quantity (no clear first — a
    // per-keystroke reset or blur would swallow the second character)
    const packedInput = await screen.findByLabelText(/^packed/i)
    await user.type(packedInput, '12')
    expect(packedInput).toHaveFocus()

    // Then the input is not blurred and Save is live
    const saveButton = screen.getByRole('button', { name: /save/i })
    expect(saveButton).not.toBeDisabled()

    // When the user saves
    await user.click(saveButton)

    // Then the change is actually persisted — the user's complaint was that it
    // was not
    await waitFor(async () => {
      expect((await getItemStock(item.id))?.packedQuantity).toBe(12)
    })
  })

  // A SHAPE guard for the number-input rewrite, not a guard for the focus bug
  // itself: the fields now hold the user's raw TEXT while being edited, so the
  // risk this pins is a string leaking into the payload. Mutation-checked — it
  // goes red ("expected '7' to be 7") when the form stops resolving that text
  // back to a number, and it stays green under the plain revert to the old
  // per-keystroke Number() coercion, because userEvent keeps its own value
  // buffer and so cannot reproduce the caret jump a real browser shows. The
  // caret/empty-field behaviour is pinned in ItemForm.test.tsx instead.
  it('user can retype every stock number from scratch and have them all persist', async () => {
    const user = userEvent.setup()

    // Given an item stocked with numbers the user wants to replace outright
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
    const packedInput = await screen.findByLabelText(/^packed/i)

    // When the user backspaces each field empty and types a new value — the
    // exact sequence that used to lose the first keystroke on a field showing 0
    await user.click(packedInput)
    await user.keyboard('{Backspace}7')
    expect(packedInput).toHaveValue(7)

    const unpackedInput = screen.getByLabelText(/^unpacked/i)
    await user.click(unpackedInput)
    await user.keyboard('{Backspace}3')

    // getByRole('spinbutton', …), not getByLabelText: the stepper buttons'
    // aria-labels ("Increase/Decrease target quantity") now contain "target
    // quantity" too (Minor 6), so an unanchored getByLabelText would match
    // three elements. getByRole('spinbutton') excludes the buttons by role.
    const targetInput = screen.getByRole('spinbutton', {
      name: /target quantity/i,
    })
    await user.click(targetInput)
    await user.keyboard('{Backspace}9')

    const refillInput = screen.getByLabelText(/refill when below/i)
    await user.click(refillInput)
    await user.keyboard('{Backspace}5')

    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then every one of them is persisted as a number on this location's row
    await waitFor(async () => {
      const stock = await getItemStock(item.id)
      expect(stock?.packedQuantity).toBe(7)
      expect(stock?.unpackedQuantity).toBe(3)
      expect(stock?.targetQuantity).toBe(9)
      expect(stock?.refillThreshold).toBe(5)
    })
  })
  // The recipe-adjust dialog moved to the Info tab with the global fields that
  // trigger it. Editing one location's numbers must not rescale every recipe —
  // that coupling was the defect the field move fixes.
  it('user editing a per-location quantity is not asked to rescale recipes', async () => {
    const user = userEvent.setup()

    // Given an item used by a recipe, with a consume amount that a rescale
    // would visibly change
    const item = await createItem({
      name: 'Flour',
      packageUnit: 'bag',
      targetUnit: 'package',
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 2,
      tagIds: [],
    })
    await createRecipe({
      name: 'Bread',
      items: [{ itemId: item.id, defaultAmount: 5 }],
    })

    renderStockTab(item.id)
    await screen.findByRole('spinbutton', { name: /target quantity/i })

    // When the user changes this location's target quantity and saves
    const targetInput = screen.getByRole('spinbutton', {
      name: /target quantity/i,
    })
    await user.clear(targetInput)
    await user.type(targetInput, '9')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then no rescale dialog appears and the recipe amount is untouched
    await waitFor(async () => {
      expect((await getItemStock(item.id))?.targetQuantity).toBe(9)
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    const recipes = await getRecipes()
    expect(recipes[0]?.items[0]?.defaultAmount).toBe(5)
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

  it('saving on another location page writes to that location, not the active one', async () => {
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
    await screen.findByLabelText(/^packed/i)

    // When the user pages to the other location, edits its stock and saves
    await user.click(screen.getByRole('tab', { name: 'Cabin' }))
    await waitFor(() => {
      expect(screen.getByLabelText(/^packed/i)).toHaveValue(7)
    })
    const packedInput = screen.getByLabelText(/^packed/i)
    await user.clear(packedInput)
    await user.type(packedInput, '9')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the change lands on that location's ItemStock and the active
    // location's own stock is untouched
    await waitFor(async () => {
      expect((await getItemStock(item.id, cabin.id))?.packedQuantity).toBe(9)
    })
    expect(
      (await getItemStock(item.id, DEFAULT_LOCATION_ID))?.packedQuantity,
    ).toBe(2)
  })

  // Regression guard for the cross-location field bleed: `useItem()` hands the
  // tab a PantryItem ALREADY joined with the ACTIVE location's stock, so a page
  // built by spreading another location's row over it inherits the active
  // location's value for every optional key that row happens to omit — and Save
  // then writes it into the other location's ItemStock.
  it('user sees the same global settings on every location page, but each location’s own due date', async () => {
    const user = userEvent.setup()

    // Given an item whose GLOBAL configuration is fully set…
    const cabin = await createLocation('Cabin')
    const office = await createLocation('Office')
    const item = await createItem({
      name: 'Milk',
      tagIds: [],
      packageUnit: 'bottle',
      measurementUnit: 'ml',
      amountPerPackage: 500,
      targetUnit: 'package',
      consumeAmount: 1,
      expirationMode: 'date',
      estimatedDueDays: 30,
      expirationThreshold: 5,
    })
    // …and whose ACTIVE-location row carries its own per-location state
    await upsertItemStock(item.id, DEFAULT_LOCATION_ID, {
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0,
      dueDate: new Date('2030-01-02T00:00:00.000Z'),
    })

    // …and two other locations whose rows carry only the required state —
    // the normal shape of any row created before a field was first set
    const baseRow = {
      itemId: item.id,
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 1,
      unpackedQuantity: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    await db.itemStocks.add({
      ...baseRow,
      id: crypto.randomUUID(),
      locationId: cabin.id,
    })
    // The office row sets its own expiration date.
    await db.itemStocks.add({
      ...baseRow,
      id: crypto.randomUUID(),
      locationId: office.id,
      dueDate: new Date('2031-06-07T00:00:00.000Z'),
    })

    renderStockTab(item.id)
    await screen.findByLabelText(/^packed/i)

    // When the user pages to the location with the bare row
    await user.click(screen.getByRole('tab', { name: 'Cabin' }))
    await waitFor(() => {
      expect(screen.getByLabelText(/^packed/i)).toHaveValue(1)
    })

    // Then the item's GLOBAL package unit still labels this location's
    // quantities — it belongs to the item, not to the location, even though
    // this location's row carries nothing but numbers
    expect(screen.getByLabelText(/^packed \(bottle\)$/i)).toBeInTheDocument()
    expect(
      screen.getByLabelText(/^target quantity \(bottle\)$/i),
    ).toBeInTheDocument()
    // …and the global settings themselves are not editable from here
    expect(screen.queryByLabelText(/package unit/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/measurement unit/i)).not.toBeInTheDocument()
    // …while the due date is genuinely this location's own, and unset here
    expect(screen.getByLabelText(/expires on/i)).toHaveValue('')

    // And saving this page writes only per-location state into this
    // location's ItemStock — never the configuration
    const targetInput = screen.getByRole('spinbutton', {
      name: /target quantity/i,
    })
    await user.clear(targetInput)
    await user.type(targetInput, '6')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(async () => {
      expect((await getItemStock(item.id, cabin.id))?.targetQuantity).toBe(6)
    })
    const cabinStock = (await getItemStock(item.id, cabin.id)) as unknown as
      | Record<string, unknown>
      | undefined
    expect(cabinStock?.dueDate).toBeFalsy()
    for (const key of GLOBAL_STOCK_KEYS) {
      expect(cabinStock).not.toHaveProperty(key)
    }
    // The active location keeps its own due date
    const homeStock = await getItemStock(item.id, DEFAULT_LOCATION_ID)
    expect(homeStock?.dueDate).toBeInstanceOf(Date)
  })

  it('shows the viewed location’s own expiry date', async () => {
    const user = userEvent.setup()

    // Given an item with a global expiry warning threshold, stocked in two
    // locations that each carry their own expiry date
    const office = await createLocation('Office')
    const item = await createItem({
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      consumeAmount: 1,
      expirationMode: 'date',
      expirationThreshold: 5,
    })
    await upsertItemStock(item.id, DEFAULT_LOCATION_ID, {
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0,
      dueDate: new Date('2030-01-02T00:00:00.000Z'),
    })
    await db.itemStocks.add({
      id: crypto.randomUUID(),
      itemId: item.id,
      locationId: office.id,
      targetQuantity: 4,
      refillThreshold: 2,
      packedQuantity: 1,
      unpackedQuantity: 0,
      dueDate: new Date('2031-06-07T00:00:00.000Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    renderStockTab(item.id)
    await screen.findByLabelText(/^packed/i)

    // When the user pages to that location
    await user.click(screen.getByRole('tab', { name: 'Office' }))

    // Then it shows its own due date
    await waitFor(() => {
      expect(screen.getByLabelText(/expires on/i)).toHaveValue('2031-06-07')
    })
    // …and the warning threshold, being global, is not editable from here
    expect(screen.queryByLabelText(/warning in/i)).not.toBeInTheDocument()
  })

  it('keeps the active location marked while the user views another one', async () => {
    const user = userEvent.setup()

    // Given two locations, the default one active
    const cabin = await createLocation('Cabin')
    const item = await createItem({ name: 'Milk', tagIds: [] })
    await addItemToLocation(item.id, cabin.id)

    renderStockTab(item.id)

    // Then that location's dot names it as the current location — the dots
    // themselves draw page position only, so the name is where the fact lives
    const activeTab = await screen.findByRole('tab', {
      name: /my home.*current location/i,
    })
    expect(activeTab).toHaveAttribute('aria-selected', 'true')

    // When the user pages away from it
    await user.click(screen.getByRole('tab', { name: 'Cabin' }))

    // Then the "(current location)" name stays on My Home even though Cabin is
    // the page being viewed
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Cabin' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })
    expect(
      screen.getByRole('tab', { name: /my home.*current location/i }),
    ).toHaveAttribute('aria-selected', 'false')
  })

  it('asks before paging away from unsaved edits, and clears the tab dirty guard', async () => {
    const user = userEvent.setup()

    // Given an item stocked in two locations
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
    await screen.findByLabelText(/^packed/i)

    // When the user edits the form and then tries to page to another location
    const packedInput = screen.getByLabelText(/^packed/i)
    await user.clear(packedInput)
    await user.type(packedInput, '5')
    await user.click(screen.getByRole('tab', { name: 'Cabin' }))

    // Then the edits are not dropped silently — the discard dialog asks first
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.getByLabelText(/^packed/i)).toHaveValue(5)

    // And discarding turns the page…
    await user.click(within(dialog).getByRole('button', { name: /discard/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/^packed/i)).toHaveValue(7)
    })

    // …and clears the layout dirty flag with it: leaving the tab afterwards
    // must not re-raise a discard prompt for edits that no longer exist
    await user.click(screen.getByRole('link', { name: /item info tab/i }))
    await waitFor(() => {
      expect(screen.queryByLabelText(/^packed/i)).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('leaves no phantom unsaved-changes prompt after removing a location with a dirty form', async () => {
    const user = userEvent.setup()

    // Given an item stocked in two locations
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

    renderStockTab(item.id)
    await screen.findByLabelText(/^packed/i)

    // When the user edits the form and then removes this location — the form
    // is replaced by the not-stocked empty state, so nothing remounts to
    // report the dirty state back down
    const packedInput = screen.getByLabelText(/^packed/i)
    await user.clear(packedInput)
    await user.type(packedInput, '5')
    await user.click(
      screen.getByRole('button', { name: /remove from location/i }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /remove/i }))
    await screen.findByRole('button', { name: /add to location/i })

    // Then leaving the tab is not blocked by edits that no longer exist
    await user.click(screen.getByRole('link', { name: /item info tab/i }))
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /add to location/i }),
      ).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('names the active location in the pager while another page is viewed', async () => {
    const user = userEvent.setup()

    // Given two locations, the default one active
    const cabin = await createLocation('Cabin')
    const item = await createItem({ name: 'Milk', tagIds: [] })
    await addItemToLocation(item.id, cabin.id)

    renderStockTab(item.id)

    // Then standing on the active location says so
    expect(await screen.findByText('Current location')).toBeInTheDocument()

    // When the user pages away from it
    await user.click(screen.getByRole('tab', { name: 'Cabin' }))

    // Then the pager still names it, in words — the dots mark page position
    // only, so this caption is the sole sighted cue for the current location
    expect(
      await screen.findByText('Current location: My Home'),
    ).toBeInTheDocument()
  })

  it('announces the location being viewed in a live region', async () => {
    const user = userEvent.setup()

    // Given two locations
    const cabin = await createLocation('Cabin')
    const item = await createItem({ name: 'Milk', tagIds: [] })
    await addItemToLocation(item.id, cabin.id)

    renderStockTab(item.id)
    await screen.findByLabelText(/^packed/i)
    expect(screen.getByText(/viewing stock for my home/i)).toBeInTheDocument()

    // When the user turns the page
    await user.click(screen.getByRole('tab', { name: 'Cabin' }))

    // Then the live region announces the new location
    const live = await screen.findByText(/viewing stock for cabin/i)
    expect(live).toBeInTheDocument()
    expect(live).toHaveAttribute('aria-live', 'polite')
  })

  it('user can jump to the first and last location with Home and End', async () => {
    const user = userEvent.setup()

    // Given three locations
    await createLocation('Cabin')
    await createLocation('Office')
    const item = await createItem({ name: 'Milk', tagIds: [] })

    renderStockTab(item.id)
    const firstTab = await screen.findByRole('tab', { name: /my home/i })
    firstTab.focus()

    // When the user presses End
    await user.keyboard('{End}')

    // Then the last location is selected and focused
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Office' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })
    expect(screen.getByRole('tab', { name: 'Office' })).toHaveFocus()

    // And Home returns to the first
    await user.keyboard('{Home}')
    await waitFor(() => {
      expect(
        screen.getByRole('tab', { name: /my home.*current location/i }),
      ).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('disables the chevron at each end of the pager', async () => {
    const user = userEvent.setup()

    // Given two locations, opening on the first
    await createLocation('Cabin')
    const item = await createItem({ name: 'Milk', tagIds: [] })

    renderStockTab(item.id)
    await screen.findByRole('tablist')

    // Then the previous chevron is dead and the next one is live — paging
    // clamps rather than wraps, and the boundary has to be visible
    expect(
      screen.getByRole('button', { name: /previous location/i }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: /next location/i })).toBeEnabled()

    // When the user reaches the last page
    await user.click(screen.getByRole('button', { name: /next location/i }))

    // Then the ends swap
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /next location/i }),
      ).toBeDisabled()
    })
    expect(
      screen.getByRole('button', { name: /previous location/i }),
    ).toBeEnabled()
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
        screen.getByRole('tab', { name: /my home.*current location/i }),
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

  // The literal state the PR D implicit stock-add dialog guarded: the item is
  // not stocked in the ACTIVE location when the tab opens. There is no form to
  // save here at all, which is why that dialog is gone.
  it('opens on the empty state when the item is not stocked in the active location', async () => {
    // Given an item stocked only somewhere else
    const cabin = await createLocation('Cabin')
    const item = await createItem({ name: 'Butter', tagIds: [] }, cabin.id)

    renderStockTab(item.id)

    // Then the active location's page offers to add it, with no stock form
    // that Save could silently create a row from
    expect(
      await screen.findByRole('button', { name: /add to location/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/not stocked here/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^packed/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /save/i }),
    ).not.toBeInTheDocument()
    expect(await getItemStock(item.id, DEFAULT_LOCATION_ID)).toBeUndefined()
  })

  it('never runs the remove-dialog counts unscoped', async () => {
    // Given an item stocked in the active location
    await createLocation('Cabin')
    const item = await createItem({ name: 'Milk', tagIds: [] })

    renderStockTab(item.id)
    await screen.findByLabelText(/^packed/i)
    await screen.findByRole('button', { name: /remove from location/i })

    // Then every count query the tab ran names a location. Declared before
    // `useLocations()` resolves they would each fire once with
    // `locationId: undefined` — an item-global scan whose result is wrong for
    // a dialog that names one location, thrown away a tick later.
    const countKeys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey)
      .filter((key) => key[1] === 'countByItem')
    expect(countKeys.length).toBeGreaterThan(0)
    for (const key of countKeys) {
      expect((key[3] as { locationId?: string }).locationId).toBeDefined()
    }
  })

  it('tells the user when adding to a location fails', async () => {
    const user = userEvent.setup()

    // Given an item not stocked in the active location, and a write that fails
    const cabin = await createLocation('Cabin')
    const item = await createItem({ name: 'Butter', tagIds: [] }, cabin.id)
    const addSpy = vi
      .spyOn(db.itemStocks, 'add')
      .mockRejectedValueOnce(new Error('disk on fire'))

    renderStockTab(item.id)
    const addButton = await screen.findByRole('button', {
      name: /add to location/i,
    })

    // When the user tries to add it
    await user.click(addButton)

    // Then the failure is reported instead of vanishing into an unhandled
    // rejection, and the page still offers to try again
    expect(
      await screen.findByText(/could not add butter to my home/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /add to location/i }),
    ).toBeEnabled()
    addSpy.mockRestore()
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
    // Noise in the OTHER location: two logs and a cart entry that this removal
    // must not claim (an item-global count would say 3 and 2).
    for (const delta of [1, 2]) {
      await addInventoryLog({
        itemId: item.id,
        locationId: DEFAULT_LOCATION_ID,
        delta,
        quantity: delta,
        occurredAt: new Date(),
      })
    }
    const homeCartId = cartIdFor(DEFAULT_LOCATION_ID, null)
    await db.shoppingCarts.put({ id: homeCartId })
    await addToCart(homeCartId, item.id, 1)

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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  createItem,
  createShelf,
  createTag,
  createTagType,
  createVendor,
} from '@/db/operations'
import { ACTIVE_LOCATION_STORAGE_KEY } from '@/hooks/useActiveLocation'
import { renderWithRouter } from '@/test/utils'
import { DEFAULT_LOCATION_ID } from '@/types'
import { ShelfDetailView } from './ShelfDetailView'

// `useUpdateItem` is replaced by a spy so the assertion can read the exact
// `{ id, updates }` payload the view builds — what is under test is the view's
// forwarding of the dialog's `onSubmit` fields, not what Dexie does afterwards.
const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }))

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>()
  return {
    ...actual,
    useUpdateItem: () => ({ mutateAsync, mutate: vi.fn(), isPending: false }),
  }
})

// A spy on the real local-mode write behind `useApplyShelfFilterPicks`
// (`applyShelfFilterPicksBatch`), wrapping rather than replacing it — the
// filter-shelf picker tests below want to assert on the exact
// `{ itemId, addTagIds, addVendorIds }` payload AND on the real Dexie
// mutation actually landing (the row leaving the tail), not one or the
// other.
const { applyPicksSpy } = vi.hoisted(() => ({ applyPicksSpy: vi.fn() }))

// A gate on `getShelf` — the query behind `useShelfQuery()`, which is where the
// view reads `shelf.itemIds` from. NOT `listShelves`: that one backs
// `['shelves']`, which the same prefix invalidation also matches, but gating it
// would leave `['shelves', id]` free to refetch — so `shelf.itemIds` would
// already be fresh and Milk would have left the tail before the assertion could
// look at it. Holding a REFETCH open (the gate stays off until a test turns it
// on, so the initial load is untouched) is what makes "the invalidation has not
// landed yet" an observable state rather than a millisecond nobody can assert
// on.
const { shelfGate } = vi.hoisted(() => ({
  shelfGate: {
    hold: false,
    release: null as null | (() => void),
  },
}))

vi.mock('@/db/operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/operations')>()
  return {
    ...actual,
    getShelf: async (id: string) => {
      if (shelfGate.hold) {
        await new Promise<void>((resolve) => {
          shelfGate.release = resolve
        })
      }
      return actual.getShelf(id)
    },
    applyShelfFilterPicksBatch: async (
      input: Parameters<typeof actual.applyShelfFilterPicksBatch>[0],
    ) => {
      applyPicksSpy(input)
      return actual.applyShelfFilterPicksBatch(input)
    },
  }
})

// The gate is module-level shared state, so a test that finishes with `hold`
// still true would hang the NEXT test's first `getShelf` — in this file or in
// any describe added below — with a timeout nobody would trace back to here.
afterEach(() => {
  shelfGate.hold = false
  shelfGate.release?.()
  shelfGate.release = null
})

// The stored values are deliberately different from the submitted ones, and all
// four submitted values differ from each other. A view that forwards the item's
// stored target/refill, drops a field, or swaps the two therefore cannot pass.
const STORED = {
  packedQuantity: 1,
  unpackedQuantity: 0,
  targetQuantity: 6,
  refillThreshold: 2,
}
const SUBMITTED = {
  packedQuantity: 3,
  unpackedQuantity: 1,
  targetQuantity: 7,
  refillThreshold: 4,
}

const stockMilk = () =>
  createItem(
    {
      name: 'Milk',
      tagIds: [],
      targetUnit: 'package',
      packageUnit: 'bottle',
      consumeAmount: 1,
      ...STORED,
    },
    DEFAULT_LOCATION_ID,
  )

// Opens the quick-update dialog on Milk, moves all four fields off their stored
// values via the steppers, then presses Update.
async function quickUpdateMilk(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', { name: 'Update quantity of Milk' }),
  )
  const dialog = await screen.findByRole('dialog')
  const press = async (label: string, times: number) => {
    for (let i = 0; i < times; i++) {
      await user.click(within(dialog).getByRole('button', { name: label }))
    }
  }
  await press('Increase packed', 2) // 1 -> 3
  await press('Increase unpacked', 1) // 0 -> 1
  await press('Increase target quantity', 1) // 6 -> 7
  await press('Increase refill threshold', 2) // 2 -> 4
  await user.click(within(dialog).getByRole('button', { name: 'Update' }))
}

describe('ShelfDetailView quick update', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.shelves.clear()
    await db.recipes.clear()
    await db.vendors.clear()
    await db.locations.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    localStorage.clear()
    localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
    mutateAsync.mockReset()
    mutateAsync.mockResolvedValue(undefined)
  })

  it('user can edit target and refill from a shelf page and have all four stock fields saved', async () => {
    // Given a selection shelf holding an item with target 6 / refill 2
    const milk = await stockMilk()
    const shelf = await createShelf({
      name: 'Fridge',
      type: 'selection',
      order: 0,
      itemIds: [milk.id],
    })
    const user = userEvent.setup()
    await renderWithRouter(<ShelfDetailView shelfId={shelf.id} />)

    // When the user raises every field in the quick-update dialog and submits
    await quickUpdateMilk(user)

    // Then all four fields reach the update mutation with the edited values
    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(mutateAsync).toHaveBeenCalledWith({
      id: milk.id,
      updates: SUBMITTED,
    })
  })

  it('user can edit the due date from a shelf page when the item is in date mode', async () => {
    // Given a selection shelf holding an item in date mode with a stored due date
    const milk = await createItem(
      {
        name: 'Milk',
        tagIds: [],
        targetUnit: 'package',
        packageUnit: 'bottle',
        consumeAmount: 1,
        expirationMode: 'date',
        dueDate: new Date('2026-09-01'),
        ...STORED,
      },
      DEFAULT_LOCATION_ID,
    )
    const shelf = await createShelf({
      name: 'Fridge',
      type: 'selection',
      order: 0,
      itemIds: [milk.id],
    })
    const user = userEvent.setup()
    await renderWithRouter(<ShelfDetailView shelfId={shelf.id} />)

    // When the user opens the dialog, edits the due date, and presses Update
    await user.click(
      await screen.findByRole('button', { name: 'Update quantity of Milk' }),
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/expires on/i), {
      target: { value: '2026-10-15' },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Update' }))

    // Then the mutation receives the edited due date alongside the untouched
    // stored quantities — proving the view forwards `dueDate` through rather
    // than dropping it on the way to `updateItem.mutateAsync`.
    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(mutateAsync).toHaveBeenCalledWith({
      id: milk.id,
      updates: { ...STORED, dueDate: new Date('2026-10-15') },
    })
  })
})

// Renders the view with a search already in the URL, so the tail is on without
// driving the toolbar's search toggle. `renderWithRouter` is pinned to '/'.
const renderSearching = async (shelfId: string, query: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = () => (
    <QueryClientProvider client={queryClient}>
      <ShelfDetailView shelfId={shelfId} />
    </QueryClientProvider>
  )
  const rootRoute = createRootRoute({ component: Wrapper })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: [`/?q=${encodeURIComponent(query)}`],
    }),
  })
  render(<RouterProvider router={router} />)
  await router.load()
  return { queryClient }
}

describe('ShelfDetailView search tail', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.shelves.clear()
    await db.recipes.clear()
    await db.vendors.clear()
    await db.locations.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    localStorage.clear()
    localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
    shelfGate.hold = false
    shelfGate.release = null
  })

  it('user cannot press the group action again until its refetch lands', async () => {
    // Given an empty selection shelf and Milk stocked here — so Milk is a
    // bucket-2 row carrying a live "Add to shelf" button
    const milk = await stockMilk()
    const shelf = await createShelf({
      name: 'Fridge',
      type: 'selection',
      order: 0,
      itemIds: [],
    })
    await renderSearching(shelf.id, 'Milk')

    const label = 'Add to shelf: Milk'
    expect(await screen.findByRole('button', { name: label })).toBeEnabled()

    // When the user presses it while the `['shelves', id]` refetch is held open
    shelfGate.hold = true
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: label }))
    })
    // The write has committed and `onSuccess` has fired — the refetch it kicked
    // off is now sitting on the gate.
    await waitFor(() => expect(shelfGate.release).not.toBeNull())
    // Everything already resolvable resolves. Without the returned
    // invalidation, THIS is where `mutateAsync` settles and the wiring hook's
    // `finally` re-enables the row against a `shelf.itemIds` that still has no
    // Milk in it — which is the regression this test exists to catch.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Then the button is still disabled — the mutation has not resolved,
    // because the list it feeds has not caught up yet
    expect(screen.getByRole('button', { name: label })).toBeDisabled()
    expect((await db.shelves.get(shelf.id))?.itemIds).toEqual([milk.id])

    // When the refetch lands
    await act(async () => {
      shelfGate.release?.()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Then Milk has moved out of the tail and into the shelf's own list
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: label })).toBeNull()
    })
    expect(
      screen.getByRole('button', { name: `Update quantity of ${milk.name}` }),
    ).toBeInTheDocument()
  })
})

// Field defaults `createItem` needs beyond `name`/`tagIds` — not stock-specific
// (see the identical comment on `itemDefaults` in `routes/index.test.tsx`,
// which this mirrors): `targetQuantity`/`refillThreshold`/`packedQuantity`/
// `unpackedQuantity` are per-location `ItemStock` state, `targetUnit` and
// `consumeAmount` are global `Item` configuration.
const itemDefaults = {
  targetUnit: 'package' as const,
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 0,
  unpackedQuantity: 0,
  consumeAmount: 1,
}

describe('ShelfDetailView filter shelf picker', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.itemStocks.clear()
    await db.shelves.clear()
    await db.recipes.clear()
    await db.vendors.clear()
    await db.locations.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()
    localStorage.clear()
    localStorage.removeItem(ACTIVE_LOCATION_STORAGE_KEY)
    shelfGate.hold = false
    shelfGate.release = null
    applyPicksSpy.mockClear()
  })

  it('user can join a single-criterion filter shelf by confirming its pre-selected pick', async () => {
    // Given a filter shelf keyed on one tag, and a stocked item lacking that
    // tag (so it is in bucket 2 — stocked here, absent from this shelf's list)
    const categoryType = await createTagType({
      name: 'Category',
      color: 'blue',
    })
    const snackTag = await createTag({
      typeId: categoryType.id,
      name: 'Snacks',
    })
    const shelf = await createShelf({
      name: 'Snack Shelf',
      type: 'filter',
      order: 0,
      filterConfig: { tagIds: [snackTag.id] },
    })
    const pretzels = await createItem({
      name: 'Pretzels',
      tagIds: [],
      ...itemDefaults,
    })
    const user = userEvent.setup()
    await renderSearching(shelf.id, 'pretzels')

    // When the user searches for it and presses Add to shelf
    await user.click(
      await screen.findByRole('button', { name: 'Add to shelf: Pretzels' }),
    )

    // Then the dialog opens — always, per the designer's double-confirm
    // ruling (2026-08-28) — and the axis's single option is ALREADY
    // selected, so Confirm needs no interaction from the user
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('radio', { name: 'Snacks' })).toBeChecked()
    const addButton = within(dialog).getByRole('button', { name: 'Add' })
    expect(addButton).toBeEnabled()

    // When the user confirms
    await user.click(addButton)

    // Then the item gains the tag
    await waitFor(() =>
      expect(applyPicksSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: pretzels.id,
          addTagIds: [snackTag.id],
        }),
      ),
    )
  })

  it('pre-selects a single-option VENDOR axis, mapping the confirmed pick onto addVendorIds', async () => {
    // Given a filter shelf keyed on a single vendor — the vendor half of the
    // pre-selection path, which the tag-only test above does not exercise. A
    // swapped mapping (e.g. `addVendorIds: picks.tagIds`) would still pass
    // every tag-only assertion in this file.
    const costco = await createVendor('Costco')
    const shelf = await createShelf({
      name: 'Costco Shelf',
      type: 'filter',
      order: 0,
      filterConfig: { vendorIds: [costco.id] },
    })
    const cereal = await createItem({
      name: 'Cereal',
      tagIds: [],
      ...itemDefaults,
    })
    const user = userEvent.setup()
    await renderSearching(shelf.id, 'cereal')

    // When the user presses Add to shelf
    await user.click(
      await screen.findByRole('button', { name: 'Add to shelf: Cereal' }),
    )

    // Then the dialog opens with its single vendor option already selected
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('radio', { name: 'Costco' })).toBeChecked()

    // When the user confirms
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))

    // Then the vendor pick lands on addVendorIds, not addTagIds
    await waitFor(() =>
      expect(applyPicksSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: cereal.id,
          addTagIds: [],
          addVendorIds: [costco.id],
        }),
      ),
    )
  })

  it('user picks one option per axis when the shelf filters on two tag types', async () => {
    // Given a filter shelf with Category(Dairy|Frozen) AND Storage(Fridge|Pantry)
    const categoryType = await createTagType({
      name: 'Category',
      color: 'blue',
    })
    const storageType = await createTagType({ name: 'Storage', color: 'green' })
    const dairyTag = await createTag({ typeId: categoryType.id, name: 'Dairy' })
    const frozenTag = await createTag({
      typeId: categoryType.id,
      name: 'Frozen',
    })
    const fridgeTag = await createTag({
      typeId: storageType.id,
      name: 'Fridge',
    })
    const pantryTag = await createTag({
      typeId: storageType.id,
      name: 'Pantry',
    })
    const shelf = await createShelf({
      name: 'Mixed Shelf',
      type: 'filter',
      order: 0,
      filterConfig: {
        tagIds: [dairyTag.id, frozenTag.id, fridgeTag.id, pantryTag.id],
      },
    })
    const yogurt = await createItem({
      name: 'Yogurt',
      tagIds: [],
      ...itemDefaults,
    })
    const user = userEvent.setup()
    await renderSearching(shelf.id, 'yogurt')

    // When the user presses Add to shelf on a bucket-2 row
    await user.click(
      await screen.findByRole('button', { name: 'Add to shelf: Yogurt' }),
    )

    // Then the dialog opens with BOTH axes
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Category')).toBeInTheDocument()
    expect(within(dialog).getByText('Storage')).toBeInTheDocument()

    // And confirming applies both picks
    await user.click(within(dialog).getByRole('radio', { name: 'Dairy' }))
    await user.click(within(dialog).getByRole('radio', { name: 'Fridge' }))
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(applyPicksSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: yogurt.id,
          addTagIds: expect.arrayContaining([dairyTag.id, fridgeTag.id]),
        }),
      ),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  })

  it('shows an axis as met once the underlying item gains it while the dialog stays open', async () => {
    // Given the same two-axis filter shelf, opened on an item that satisfies
    // neither axis
    const categoryType = await createTagType({
      name: 'Category',
      color: 'blue',
    })
    const storageType = await createTagType({ name: 'Storage', color: 'green' })
    const dairyTag = await createTag({ typeId: categoryType.id, name: 'Dairy' })
    const frozenTag = await createTag({
      typeId: categoryType.id,
      name: 'Frozen',
    })
    const fridgeTag = await createTag({
      typeId: storageType.id,
      name: 'Fridge',
    })
    const pantryTag = await createTag({
      typeId: storageType.id,
      name: 'Pantry',
    })
    const shelf = await createShelf({
      name: 'Mixed Shelf',
      type: 'filter',
      order: 0,
      filterConfig: {
        tagIds: [dairyTag.id, frozenTag.id, fridgeTag.id, pantryTag.id],
      },
    })
    const yogurt = await createItem({
      name: 'Yogurt',
      tagIds: [],
      ...itemDefaults,
    })
    const user = userEvent.setup()
    const { queryClient } = await renderSearching(shelf.id, 'yogurt')

    // When the dialog is opened with both axes unmet
    await user.click(
      await screen.findByRole('button', { name: 'Add to shelf: Yogurt' }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('radio', { name: 'Dairy' }),
    ).toBeInTheDocument()

    // And the item gains the Dairy tag from OUTSIDE the dialog — standing in
    // for a concurrent edit from another tab or surface whose own refetch
    // lands while this dialog is still open
    await db.items.update(yogurt.id, { tagIds: [dairyTag.id] })
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['items'] })
    })

    // Then the Category axis renders read-only as already-satisfied — the
    // dialog's item is re-derived live from `allItems`, not frozen at the
    // moment the button was pressed — while the dialog stays open and the
    // untouched Storage axis is still an open choice
    await waitFor(() =>
      expect(
        within(dialog).getByText(/already set: dairy/i),
      ).toBeInTheDocument(),
    )
    expect(
      within(dialog).queryByRole('radio', { name: 'Dairy' }),
    ).not.toBeInTheDocument()
    expect(
      within(dialog).getByRole('radio', { name: 'Fridge' }),
    ).toBeInTheDocument()
  })

  it('does not ask about an axis the item already satisfies', async () => {
    // Given the item is already tagged Frozen and the shelf also filters on
    // a vendor axis with two options — a genuine choice, so an open radio
    // group is expected there regardless of the dialog's own always-open
    // behaviour
    const categoryType = await createTagType({
      name: 'Category',
      color: 'blue',
    })
    const frozenTag = await createTag({
      typeId: categoryType.id,
      name: 'Frozen',
    })
    const costco = await createVendor('Costco')
    const walmart = await createVendor('Walmart')
    const shelf = await createShelf({
      name: 'Frozen Shelf',
      type: 'filter',
      order: 0,
      filterConfig: {
        tagIds: [frozenTag.id],
        vendorIds: [costco.id, walmart.id],
      },
    })
    await createItem({
      name: 'Peas',
      tagIds: [frozenTag.id],
      ...itemDefaults,
    })
    const user = userEvent.setup()
    await renderSearching(shelf.id, 'peas')

    // When the row's button is pressed
    await user.click(
      await screen.findByRole('button', { name: 'Add to shelf: Peas' }),
    )

    // Then only the vendor axis is open — Category shows as already set,
    // with no radio option offered for its already-satisfied tag
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/already set: frozen/i)).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('radio', { name: 'Frozen' }),
    ).not.toBeInTheDocument()
    expect(
      within(dialog).getByRole('radio', { name: 'Costco' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('radio', { name: 'Walmart' }),
    ).toBeInTheDocument()
  })

  it('keeps the inert note when the shelf filters on a deleted vendor only', async () => {
    // Given a filter shelf whose vendorIds name a vendor that no longer exists
    const shelf = await createShelf({
      name: 'Ghost Shelf',
      type: 'filter',
      order: 0,
      filterConfig: { vendorIds: ['deleted-vendor-id'] },
    })
    await createItem({ name: 'Chips', tagIds: [], ...itemDefaults })
    await renderSearching(shelf.id, 'chips')

    // Then bucket 2 renders the note, not a button — no press could satisfy
    // that axis
    expect(
      await screen.findByText(/doesn't match this shelf's filters/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /add to shelf/i }),
    ).not.toBeInTheDocument()
  })
})

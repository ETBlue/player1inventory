import type { MockedResponse } from '@apollo/client/testing'
import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApplyUnitSwitchDocument,
  GetHouseholdDocument,
  GetItemDocument,
  GetItemsDocument,
  GetRecipesDocument,
  ItemStocksForItemDocument,
  PantryDataDocument,
} from '@/generated/graphql'
import { activeLocationStorageKey } from '@/hooks/useActiveLocation'
import { routeTree } from '@/routeTree.gen'
import {
  bootstrapCartsMock,
  type CloudStock,
  cloudItem,
  cloudStock,
  getLocationsMock,
  LOC_A,
  LOC_B,
  markLocationVisitedMock,
} from '@/test/cloudFixtures'

// The Info tab's unit switch, in CLOUD mode, through the REAL generated hooks.
//
// Until PR 3c this path could not be tested at all: `buildStockConversions`
// returned `[]` in cloud, so the dialog listed nothing and the confirm button
// sent a plain `updateItem`. The conversions were invisible, which is why no
// test failed on the missing `applyUnitSwitch` mutation.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  const REAL = new Set([
    'useGetLocationsQuery',
    // The household role: since H5 task F.5 the Info tab is read only for
    // a household member, and while the role is unknown.
    'useGetHouseholdQuery',
    'useGetItemQuery',
    'useGetRecipesQuery',
    'useItemStocksForItemQuery',
    'useApplyUnitSwitchMutation',
    'useUpdateItemMutation',
  ])
  const queryStub = () => ({
    data: undefined,
    loading: false,
    error: undefined,
  })
  const mutationStub = () => [
    vi.fn().mockResolvedValue({ data: undefined }),
    {},
  ]
  const stubbed: Record<string, unknown> = { ...original }
  for (const key of Object.keys(stubbed)) {
    if (!key.startsWith('use') || REAL.has(key)) continue
    if (key.endsWith('Mutation')) stubbed[key] = mutationStub
    else if (key.endsWith('Query')) stubbed[key] = queryStub
  }
  return stubbed
})

// `useCloudLocationId` asks Apollo directly, so the real client is needed too.
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

// Flour is tracked in grams, 500 g per pack, and stocked in BOTH cloud
// locations with DIFFERENT numbers. With one location — or with equal numbers —
// "every location converted" and "the active one converted" would be the same
// assertion.
const FLOUR = cloudItem('item-flour', 'Flour', {
  packageUnit: 'pack',
  measurementUnit: 'g',
  amountPerPackage: 500,
  targetUnit: 'measurement',
  consumeAmount: 100,
})

const FLOUR_A = cloudStock('stock-flour-a', 'item-flour', LOC_A, {
  targetQuantity: 1000,
  refillThreshold: 200,
  packedQuantity: 2,
  unpackedQuantity: 250,
})
const FLOUR_B = cloudStock('stock-flour-b', 'item-flour', LOC_B, {
  targetQuantity: 3000,
  refillThreshold: 500,
  packedQuantity: 1,
  unpackedQuantity: 750,
})

const BREAD = {
  __typename: 'Recipe' as const,
  id: 'recipe-bread',
  name: 'Bread',
  items: [
    {
      __typename: 'RecipeItem' as const,
      itemId: 'item-flour',
      defaultAmount: 200,
    },
  ],
  lastCookedAt: null,
}

// The server's state. The mutation mock writes into it and the query mocks
// read it back, so the assertions are on what the server ended up holding.
let item = FLOUR
let stocks: CloudStock[] = []
let recipes = [BREAD]
// Every `ApplyUnitSwitch` variables payload the hook sent.
let sentSwitches: Record<string, unknown>[] = []

const getItemMock = {
  request: { query: GetItemDocument, variables: { id: 'item-flour' } },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: () => ({ data: { item } }),
}

const getItemsMock = {
  request: { query: GetItemsDocument },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: () => ({ data: { items: [item] } }),
}

const getRecipesMock = {
  request: { query: GetRecipesDocument },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: () => ({ data: { recipes } }),
}

const stocksMock = {
  request: {
    query: ItemStocksForItemDocument,
    variables: { itemId: 'item-flour' },
  },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: () => ({ data: { itemStocksForItem: stocks } }),
}

const pantryMock = (locationId: string) => ({
  request: { query: PantryDataDocument, variables: { locationId } },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: () => ({
    data: {
      items: [item],
      itemStocks: stocks.filter((s) => s.locationId === locationId),
    },
  }),
})

// Stands in for the server-side `prisma.$transaction`: the item, EVERY named
// location's row, and every recipe amount move together.
const applyUnitSwitchMock = {
  request: { query: ApplyUnitSwitchDocument, variables: () => true },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: (vars: Record<string, unknown>) => {
    const input = vars.input as {
      updates: Record<string, unknown>
      stockConversions: {
        locationId: string
        quantities: Record<string, number>
      }[]
      recipeUpdates: {
        recipeId: string
        items: { itemId: string; defaultAmount: number }[]
      }[]
    }
    sentSwitches.push(input)
    item = { ...item, ...input.updates }
    stocks = stocks.map((row) => {
      const conversion = input.stockConversions.find(
        (c) => c.locationId === row.locationId,
      )
      return conversion ? { ...row, ...conversion.quantities } : row
    })
    recipes = recipes.map((recipe) => {
      const update = input.recipeUpdates.find((u) => u.recipeId === recipe.id)
      if (!update) return recipe
      return {
        ...recipe,
        items: update.items.map((ri) => ({
          __typename: 'RecipeItem' as const,
          ...ri,
        })),
      }
    })
    return { data: { applyUnitSwitch: item } }
  },
}

// The caller is a household manager, who may edit the catalog. Without it
// the Info tab is read only (households H5 task F.5) and has no Save.
const householdManagerMock = {
  request: { query: GetHouseholdDocument },
  maxUsageCount: Number.POSITIVE_INFINITY,
  result: {
    data: {
      household: {
        __typename: 'Household',
        id: 'household-1',
        name: 'Home',
        role: 'manager',
        hasOwner: true,
        pendingTransfer: null,
      },
    },
  },
}

const MOCKS = [
  householdManagerMock,
  bootstrapCartsMock,
  markLocationVisitedMock,
  getLocationsMock,
  getItemMock,
  getItemsMock,
  getRecipesMock,
  stocksMock,
  pantryMock(LOC_A),
  pantryMock(LOC_B),
  applyUnitSwitchMock,
]

function renderInfoTab(mocks: MockedProviderProps['mocks'] = MOCKS) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/items/item-flour'] }),
  })
  render(
    <MockedProvider mocks={mocks} mockLinkDefaultOptions={{ delay: 0 }}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MockedProvider>,
  )
}

describe('Item info tab unit switch — cloud mode', () => {
  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    sessionStorage.clear()
    item = FLOUR
    stocks = [FLOUR_A, FLOUR_B]
    recipes = [BREAD]
    sentSwitches = []
  })

  afterEach(() => {
    localStorage.removeItem('data-mode')
  })

  it('user in cloud mode sees every location listed before confirming a unit switch', async () => {
    const user = userEvent.setup()

    // Given a cloud item tracked in grams and stocked in two cloud locations
    renderInfoTab()
    await screen.findByDisplayValue('Flour')

    // When the user switches tracking to packages and saves
    // The "Track in measurement" switch OFF means "track in packages".
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the confirmation dialog names BOTH locations with their OWN
    // converted numbers. Before PR 3c this list was empty in cloud.
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Cloud Kitchen')).toBeInTheDocument()
    expect(within(dialog).getByText('Cloud Garage')).toBeInTheDocument()
    // Cloud Kitchen: 250 g -> 0.5 pack, 1000 -> 2, 200 -> 0.4
    expect(within(dialog).getByText(/250\D+0\.5/)).toBeInTheDocument()
    // Cloud Garage: 750 g -> 1.5 pack, 3000 -> 6, 500 -> 1
    expect(within(dialog).getByText(/750\D+1\.5/)).toBeInTheDocument()
  })

  it('user in cloud mode converts every location in ONE applyUnitSwitch call', async () => {
    const user = userEvent.setup()

    // Given the same item
    renderInfoTab()
    await screen.findByDisplayValue('Flour')

    // When the user confirms the switch to packages
    // The "Track in measurement" switch OFF means "track in packages".
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )
    await user.click(screen.getByRole('button', { name: /save/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(
      within(dialog).getByRole('button', { name: /update & save/i }),
    )

    // Then exactly ONE mutation was sent — not one call per location, which is
    // the shape that can half-apply
    await waitFor(() => expect(sentSwitches).toHaveLength(1))
    const sent = sentSwitches[0] as {
      stockConversions: {
        locationId: string
        quantities: Record<string, number>
      }[]
      recipeUpdates: { recipeId: string }[]
    }

    // And it carried BOTH locations' converted quantities
    const byLocation = new Map(
      sent.stockConversions.map((c) => [c.locationId, c.quantities]),
    )
    expect(byLocation.get(LOC_A)).toMatchObject({
      unpackedQuantity: 0.5,
      targetQuantity: 2,
      refillThreshold: 0.4,
    })
    expect(byLocation.get(LOC_B)).toMatchObject({
      unpackedQuantity: 1.5,
      targetQuantity: 6,
      refillThreshold: 1,
    })

    // And the server state ended up converted in BOTH locations
    expect(stocks.find((s) => s.locationId === LOC_A)?.targetQuantity).toBe(2)
    expect(stocks.find((s) => s.locationId === LOC_B)?.targetQuantity).toBe(6)
    // `packedQuantity` counts sealed packages and is never converted
    expect(stocks.find((s) => s.locationId === LOC_A)?.packedQuantity).toBe(2)
    expect(stocks.find((s) => s.locationId === LOC_B)?.packedQuantity).toBe(1)
  })

  it('the recipe amount travels in the same call, not a separate updateRecipe', async () => {
    const user = userEvent.setup()

    // Given a recipe using 200 g of the item
    renderInfoTab()
    await screen.findByDisplayValue('Flour')

    // When the user confirms the switch
    // The "Track in measurement" switch OFF means "track in packages".
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )
    await user.click(screen.getByRole('button', { name: /save/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(
      within(dialog).getByRole('button', { name: /update & save/i }),
    )

    // Then the recipe rewrite rode along in the one mutation — 200 g is 0.4 of
    // a 500 g pack
    await waitFor(() => expect(sentSwitches).toHaveLength(1))
    const sent = sentSwitches[0] as {
      recipeUpdates: {
        recipeId: string
        items: { itemId: string; defaultAmount: number }[]
      }[]
    }
    expect(sent.recipeUpdates).toEqual([
      {
        recipeId: 'recipe-bread',
        items: [{ itemId: 'item-flour', defaultAmount: 0.4 }],
      },
    ])
  })

  it('user turning Consumable off on an item tracked in grams drops opened stock and saves whole packs in every location in ONE call', async () => {
    const user = userEvent.setup()

    // Given the flour item, tracked in grams in two locations, with opened
    // stock in both (250 g and 750 g)
    renderInfoTab()
    await screen.findByDisplayValue('Flour')

    // When the user turns Consumable off and saves
    await user.click(screen.getByRole('switch', { name: /^consumable$/i }))
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the converted amounts dialog says opened stock is removed, and
    // lists it going to 0 in BOTH locations
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(/opened packs are removed/i),
    ).toBeInTheDocument()
    expect(within(dialog).getByText(/250\D+0$/)).toBeInTheDocument()
    expect(within(dialog).getByText(/750\D+0$/)).toBeInTheDocument()

    // When the user confirms
    await user.click(
      within(dialog).getByRole('button', { name: /update & save/i }),
    )

    // Then ONE applyUnitSwitch carries the switch to packages, the
    // consumable flag, and the kept measurement settings
    await waitFor(() => expect(sentSwitches).toHaveLength(1))
    const sent = sentSwitches[0] as {
      updates: Record<string, unknown>
      stockConversions: {
        locationId: string
        quantities: Record<string, number>
      }[]
    }
    expect(sent.updates).toMatchObject({
      consumable: false,
      targetUnit: 'package',
      measurementUnit: 'g',
      amountPerPackage: 500,
    })
    // And every location: no opened stock, target and refill in whole packs
    // (1000 g -> 2, 200 g -> 0.4 -> 1; 3000 g -> 6, 500 g -> 1)
    const byLocation = new Map(
      sent.stockConversions.map((c) => [c.locationId, c.quantities]),
    )
    expect(byLocation.get(LOC_A)).toMatchObject({
      unpackedQuantity: 0,
      targetQuantity: 2,
      refillThreshold: 1,
    })
    expect(byLocation.get(LOC_B)).toMatchObject({
      unpackedQuantity: 0,
      targetQuantity: 6,
      refillThreshold: 1,
    })
    // Packed packages are kept
    expect(stocks.find((s) => s.locationId === LOC_A)?.packedQuantity).toBe(2)
    expect(stocks.find((s) => s.locationId === LOC_B)?.packedQuantity).toBe(1)
  })

  it('user turning Consumable off on an item tracked in packages drops opened stock in every location', async () => {
    const user = userEvent.setup()

    // Given flour already tracked in packages, with half a pack open in one
    // location and nothing open in the other. No unit change happens here,
    // so before 2026-11-26 no conversion ran at all.
    item = { ...FLOUR, targetUnit: 'package', consumeAmount: 0.5 }
    stocks = [
      {
        ...FLOUR_A,
        targetQuantity: 4,
        refillThreshold: 1,
        unpackedQuantity: 0.5,
      },
      {
        ...FLOUR_B,
        targetQuantity: 3,
        refillThreshold: 1,
        unpackedQuantity: 0,
      },
    ]
    renderInfoTab()
    await screen.findByDisplayValue('Flour')

    // When the user turns Consumable off, saves and confirms
    await user.click(screen.getByRole('switch', { name: /^consumable$/i }))
    await user.click(screen.getByRole('button', { name: /save/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(
      within(dialog).getByRole('button', { name: /update & save/i }),
    )

    // Then the one call writes 0 opened stock where there was some, and
    // leaves the row that needs no change alone
    await waitFor(() => expect(sentSwitches).toHaveLength(1))
    const sent = sentSwitches[0] as {
      stockConversions: {
        locationId: string
        quantities: Record<string, number>
      }[]
    }
    expect(sent.stockConversions).toEqual([
      {
        locationId: LOC_A,
        quantities: {
          unpackedQuantity: 0,
          targetQuantity: 4,
          refillThreshold: 1,
        },
      },
    ])
    expect(stocks.find((s) => s.locationId === LOC_A)?.unpackedQuantity).toBe(0)
  })
})

// Save must wait for the reads that decide whether the converted amounts
// dialog opens (bug 2026-11-26, `docs/features/items/2026-11-26-bug-save-before-recipes-load.md`).
// `handleSubmit` counts the recipes that hold the item and the locations to
// convert. While `GetRecipes` or `ItemStocksForItem` has not answered, it
// counted none, skipped the dialog and saved: the recipe warning was lost,
// and a unit switch left recipe amounts and stock in the old unit. Found on
// Neon by `e2e/tests/consumable-items.spec.ts`.
//
// `delay: Infinity` holds a read for good, so the test looks at the screen
// while it is still loading. The item itself is NOT held: the form must be
// on screen, or the test would prove nothing about Save.
describe('Item info tab Save waits for recipes and stock — cloud mode', () => {
  beforeEach(() => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    sessionStorage.clear()
    item = FLOUR
    stocks = [FLOUR_A, FLOUR_B]
    recipes = [BREAD]
    sentSwitches = []
  })

  afterEach(() => {
    localStorage.removeItem('data-mode')
  })

  const withMock = (
    replaced: typeof getRecipesMock | typeof stocksMock,
    replacement: MockedResponse,
  ): MockedResponse[] =>
    MOCKS.map((m) => (m === replaced ? replacement : (m as MockedResponse)))

  it('user cannot save the Info tab while the recipes are still loading', async () => {
    const user = userEvent.setup()

    // Given the recipes read never answers
    renderInfoTab(
      withMock(getRecipesMock, {
        request: { query: GetRecipesDocument },
        maxUsageCount: Number.POSITIVE_INFINITY,
        delay: Number.POSITIVE_INFINITY,
      }),
    )
    await screen.findByDisplayValue('Flour')

    // When the user turns Consumable off (the form is now dirty)
    await user.click(screen.getByRole('switch', { name: /^consumable$/i }))

    // Then Save stays off, so the recipe warning cannot be skipped
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    // And a press sends nothing and opens no dialog
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(sentSwitches).toHaveLength(0)
    // And no error text shows while the read is only loading
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument()
  })

  // In cloud the stock rows can only be missing after a FAILED read: `useItem`
  // reads the same `ItemStocksForItem` query, and the item layout shows a
  // spinner, not the form, while it loads. The loading case is tested in local
  // mode, in `saveWaitsForReads.test.tsx`.
  it('user sees why the Info tab cannot be saved when the stock read failed', async () => {
    const user = userEvent.setup()

    // Given the per-location stock read fails and nothing is cached
    renderInfoTab(
      withMock(stocksMock, {
        request: {
          query: ItemStocksForItemDocument,
          variables: { itemId: 'item-flour' },
        },
        maxUsageCount: Number.POSITIVE_INFINITY,
        error: new Error('network down'),
      }),
    )
    await screen.findByDisplayValue('Flour')

    // Then the message shows
    expect(
      await screen.findByText(
        /could not load this item's recipes or stock, so it cannot be saved/i,
      ),
    ).toBeInTheDocument()

    // And after a unit switch Save stays off, so no location is left in the
    // old unit
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(sentSwitches).toHaveLength(0)
  })

  it('user sees why the Info tab cannot be saved when the recipes read failed', async () => {
    const user = userEvent.setup()

    // Given the recipes read fails and nothing is cached
    renderInfoTab(
      withMock(getRecipesMock, {
        request: { query: GetRecipesDocument },
        maxUsageCount: Number.POSITIVE_INFINITY,
        error: new Error('network down'),
      }),
    )
    await screen.findByDisplayValue('Flour')

    // Then a message says the item cannot be saved and what to do
    expect(
      await screen.findByText(
        /could not load this item's recipes or stock, so it cannot be saved/i,
      ),
    ).toBeInTheDocument()

    // And Save stays off after an edit
    await user.click(screen.getByRole('switch', { name: /^consumable$/i }))
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })
})

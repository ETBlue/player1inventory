import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
} from '@/hooks/useActiveLocation'
import { NewItemDialog } from './NewItemDialog'

// The dialog is MODE-AGNOSTIC since PR 2 Task 9b. It used to be create-only in
// cloud on two premises that Tasks 7 and 8 falsified: cloud items now carry a
// `stockId` (the `PantryData` join sets one) and `useAddItemToLocation` sends
// `addItemToLocation` in cloud rather than writing Dexie. These tests pin the
// add-existing path in cloud, and the fixture is deliberately TWO locations
// with the target item stocked only at the OTHER one — with a single location
// "stocked here" and "exists at all" are the same set and every assertion below
// would hold against a dialog that ignored locations entirely.

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...original, useNavigate: () => mockNavigate }
})

const KITCHEN = 'loc-kitchen'
const GARAGE = 'loc-garage'

const mockNavigate = vi.fn()
const mockCreateItem = vi.fn()
const mockAddItemToLocation = vi.fn()

const LOCATIONS = [
  {
    __typename: 'Location' as const,
    id: KITCHEN,
    name: 'Kitchen',
    isDefault: true,
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    __typename: 'Location' as const,
    id: GARAGE,
    name: 'Garage',
    isDefault: false,
    order: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

const ITEMS = [
  {
    id: 'item-milk',
    name: 'Milk',
    tagIds: [],
    targetUnit: 'package',
    consumeAmount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'item-flour',
    name: 'Flour',
    tagIds: [],
    targetUnit: 'package',
    consumeAmount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

function stockRow(id: string, itemId: string, locationId: string) {
  return {
    __typename: 'ItemStock' as const,
    id,
    itemId,
    locationId,
    targetQuantity: 3,
    refillThreshold: 1,
    packedQuantity: 2,
    unpackedQuantity: 0,
    dueDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

// Milk is stocked in the Kitchen; Flour ONLY in the Garage. The stub honours
// the query's `locationId` variable rather than returning one fixed list, so a
// component reading the wrong location gets the wrong answer instead of the
// right one by coincidence.
const STOCKS_BY_LOCATION: Record<string, ReturnType<typeof stockRow>[]> = {
  [KITCHEN]: [stockRow('stock-milk-kitchen', 'item-milk', KITCHEN)],
  [GARAGE]: [stockRow('stock-flour-garage', 'item-flour', GARAGE)],
}

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    // This per-file factory REPLACES the one in `src/test/setup.ts` rather than
    // layering on it, so every Apollo hook the dialog's tree mounts has to be
    // stubbed here or the real hook runs and demands a provider.
    useGetLocationsQuery: () => ({
      data: { locations: LOCATIONS },
      loading: false,
      error: undefined,
    }),
    useCreateLocationMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useUpdateLocationMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useDeleteLocationMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    useReorderLocationsMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
    usePantryDataQuery: ({
      variables,
    }: {
      variables: { locationId: string }
    }) => ({
      data: {
        items: ITEMS,
        itemStocks: STOCKS_BY_LOCATION[variables.locationId] ?? [],
      },
      loading: false,
      error: undefined,
      networkStatus: 7,
      refetch: vi.fn(),
    }),
    useCreateItemMutation: () => [mockCreateItem, { loading: false }],
    useAddItemToLocationMutation: () => [mockAddItemToLocation, {}],
    // `useCreateItem` mounts this unconditionally since Task 9 — a hook cannot
    // sit behind the mode branch — so it needs a stub here too.
    useUpsertItemStockMutation: () => [
      vi.fn().mockResolvedValue({ data: { upsertItemStock: null } }),
      {},
    ],
  }
})

function renderDialog(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveLocationProvider>{ui}</ActiveLocationProvider>
    </QueryClientProvider>,
  )
}

describe('NewItemDialog — cloud mode', () => {
  beforeEach(async () => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem(activeLocationStorageKey('cloud'), KITCHEN)
    await db.items.clear()
    await db.itemStocks.clear()
    mockNavigate.mockClear()
    mockCreateItem.mockClear()
    mockAddItemToLocation.mockReset()
    mockAddItemToLocation.mockResolvedValue({
      data: {
        addItemToLocation: stockRow(
          'stock-flour-kitchen',
          'item-flour',
          KITCHEN,
        ),
      },
    })
  })

  afterEach(() => {
    localStorage.removeItem('data-mode')
    localStorage.removeItem(activeLocationStorageKey('cloud'))
    vi.clearAllMocks()
  })

  it('user can stock an existing cloud item in the active location from the dialog', async () => {
    // Given the Kitchen is active and Flour is stocked only in the Garage
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    renderDialog(
      <NewItemDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    )

    // When the user searches for it and clicks the option
    await user.type(
      await screen.findByRole('combobox', { name: /name/i }),
      'Flour',
    )
    const option = await screen.findByRole('option', { name: /flour/i })
    expect(option).toHaveAttribute('aria-disabled', 'false')
    await user.click(option)

    // Then `addItemToLocation` stocked it in the ACTIVE location — the Kitchen,
    // not the Garage it was already in
    await waitFor(() =>
      expect(mockAddItemToLocation).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: { itemId: 'item-flour', locationId: KITCHEN },
        }),
      ),
    )

    // And the caller gets the freshly copied stock row merged over the item,
    // carrying the NEW row's id and location rather than the pre-add join's
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(onSuccess.mock.calls[0][0]).toMatchObject({
      id: 'item-flour',
      stockId: 'stock-flour-kitchen',
      locationId: KITCHEN,
      packedQuantity: 2,
      targetQuantity: 3,
    })
  })

  it('user cannot select a cloud item already stocked in the active location', async () => {
    // Given Milk IS stocked in the active Kitchen
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    renderDialog(
      <NewItemDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    )

    // When the user searches for it and clicks the option
    await user.type(
      await screen.findByRole('combobox', { name: /name/i }),
      'Milk',
    )
    const option = await screen.findByRole('option', { name: /milk/i })
    await user.click(option)

    // Then it renders disabled and nothing is written — this is the assertion
    // the Flour case above could not make, and vice versa
    expect(option).toHaveAttribute('aria-disabled', 'true')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockAddItemToLocation).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('user typing the name of an item already stocked here is told where it is', async () => {
    // Given Milk is stocked in the active Kitchen, so no option is selectable
    // and Create is suppressed — a dead end without the inline feedback
    const user = userEvent.setup()
    renderDialog(<NewItemDialog open={true} onOpenChange={vi.fn()} />)

    // When the user types that exact name
    await user.type(
      await screen.findByRole('combobox', { name: /name/i }),
      'Milk',
    )

    // Then the same location-naming sentence local mode shows appears in cloud,
    // now that cloud has locations of its own
    expect(
      await screen.findByText('Milk is already in Kitchen.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: /create/i }),
    ).not.toBeInTheDocument()
  })

  it('user typing the name of an item stocked elsewhere gets no dead end', async () => {
    // Given Flour exists in the catalog but is not stocked in the Kitchen
    const user = userEvent.setup()
    renderDialog(<NewItemDialog open={true} onOpenChange={vi.fn()} />)

    // When the user types that exact name
    await user.type(
      await screen.findByRole('combobox', { name: /name/i }),
      'Flour',
    )

    // Then Create stays suppressed (duplicate names remain impossible) but the
    // option itself is selectable, so there is nothing to explain
    expect(
      screen.queryByRole('option', { name: /create/i }),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByRole('option', { name: /flour/i }),
    ).toHaveAttribute('aria-disabled', 'false')
    expect(screen.queryByText(/is already in/i)).not.toBeInTheDocument()
  })

  it('user typing a new name in cloud mode still gets the Create path', async () => {
    // Given a cloud catalog that does not contain "Sparkling Water"
    const user = userEvent.setup()
    renderDialog(<NewItemDialog open={true} onOpenChange={vi.fn()} />)

    // When the user types a name with no exact match
    await user.type(
      await screen.findByRole('combobox', { name: /name/i }),
      'Sparkling Water',
    )

    // Then Create is offered
    expect(
      await screen.findByRole('option', { name: /create .*sparkling water/i }),
    ).toBeInTheDocument()
  })
})

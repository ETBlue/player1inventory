import { useApolloClient } from '@apollo/client/react'
import { MockedProvider } from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/cloudCache'
import {
  ConsumeRecipesDocument,
  GetItemsDocument,
  GetRecipesDocument,
  PantryDataDocument,
  type PantryDataQuery,
} from '@/generated/graphql'
import {
  bootstrapCartsMock,
  cloudItem,
  cloudRecipe,
  cloudStock,
  getLocationsMock,
  LOC_A,
  markLocationVisitedMock,
} from '@/test/cloudFixtures'
import { ActiveLocationProvider } from './useActiveLocation'
import * as dataModeHooks from './useDataMode'
import { useItems } from './useItems'
import { useConsumeRecipes, useRecipes } from './useRecipes'

// Issue #404: in cloud mode the cooking page kept the old quantity after
// Done. `ConsumeRecipes` returns no `ItemStock`, the TanStack invalidations
// do nothing in cloud, and the server sends the live `STOCK` event to OTHER
// tabs only. So the hook itself must read `PantryData` (and `GetRecipes`,
// for `lastCookedAt`) again. See
// docs/features/cooking/2026-11-24-bug-cooking-quantity-not-refreshed.md.
//
// The REAL generated hooks and the REAL `useApolloClient`: `src/test/setup.ts`
// stubs both, and its client's `query` resolves `{ data: {} }` without ever
// reaching the mocks, so no read after the write could land.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)
vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

const MILK = cloudItem('item-milk', 'Milk')
const PANCAKES = cloudRecipe('r-1', 'Pancakes', [
  { itemId: 'item-milk', defaultAmount: 2 },
])
const COOKED_AT = '2026-11-24T08:00:00.000Z'

// The server's state. The `ConsumeRecipes` mock changes it, so a read sent
// AFTER the write answers the new values and a read sent before answers the
// old ones. A mock that answered every read the same way could not tell a
// refetch from no refetch.
let packed = 5
let lastCookedAt: string | null = null
let pantryLocations: string[] = []

const any = () => true

const MOCKS = [
  bootstrapCartsMock,
  markLocationVisitedMock,
  getLocationsMock,
  {
    request: { query: PantryDataDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: (vars: Record<string, unknown>) => {
      const locationId = vars.locationId as string
      pantryLocations.push(locationId)
      return {
        data: {
          items: [MILK],
          itemStocks: [
            cloudStock(`stock-milk-${locationId}`, 'item-milk', locationId, {
              targetQuantity: 6,
              refillThreshold: 1,
              packedQuantity: packed,
              unpackedQuantity: 0,
            }),
          ],
        },
      }
    },
  },
  {
    request: { query: GetItemsDocument },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () => ({ data: { items: [MILK] } }),
  },
  {
    request: { query: GetRecipesDocument },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () => ({ data: { recipes: [{ ...PANCAKES, lastCookedAt }] } }),
  },
  {
    request: { query: ConsumeRecipesDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () => {
      packed = 3
      lastCookedAt = COOKED_AT
      return {
        data: {
          consumeRecipes: {
            __typename: 'ConsumeRecipesResult',
            itemResults: [
              {
                __typename: 'ConsumeRecipesItemResult',
                itemId: 'item-milk',
                success: true,
                error: null,
              },
            ],
            allSucceeded: true,
          },
        },
      }
    },
  },
]

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <MockedProvider
      cache={createCache()}
      mocks={MOCKS}
      mockLinkDefaultOptions={{ delay: 0 }}
    >
      <QueryClientProvider client={queryClient}>
        <ActiveLocationProvider>{children}</ActiveLocationProvider>
      </QueryClientProvider>
    </MockedProvider>
  )
}

function renderCooking() {
  return renderHook(
    () => ({
      items: useItems(),
      recipes: useRecipes(),
      consume: useConsumeRecipes(),
      client: useApolloClient(),
    }),
    { wrapper: makeWrapper() },
  )
}

const cook = {
  occurredAt: new Date(COOKED_AT),
  recipeIds: ['r-1'],
  items: [{ itemId: 'item-milk', delta: -2 }],
  localStock: [],
}

describe('useConsumeRecipes (cloud) refreshes what the cook changed', () => {
  beforeEach(() => {
    vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
      mode: 'cloud',
      setMode: vi.fn(),
    })
    localStorage.clear()
    packed = 5
    lastCookedAt = null
    pantryLocations = []
  })

  it('user sees the new quantity on the cooking page right after Done', async () => {
    // Given the cooking page shows Milk with 5 packages at the active location
    const { result } = renderCooking()
    await waitFor(() =>
      expect(
        result.current.items.data?.find((i) => i.id === 'item-milk')
          ?.packedQuantity,
      ).toBe(5),
    )

    // When the user cooks, and the server takes 2 packages out
    await result.current.consume.mutateAsync(cook)

    // Then the new amount is in the cache as soon as the call resolves: the
    // read is AWAITED, so the Done dialog closes on fresh data. Read right
    // after the `await`, with no `waitFor`, or a read that was only started
    // would pass too.
    const cached = result.current.client.readQuery<PantryDataQuery>({
      query: PantryDataDocument,
      variables: { locationId: LOC_A },
    })
    expect(cached?.itemStocks[0]?.packedQuantity).toBe(3)

    // And the page shows 3, read again for the SAME location the cook was
    // sent for
    await waitFor(() =>
      expect(
        result.current.items.data?.find((i) => i.id === 'item-milk')
          ?.packedQuantity,
      ).toBe(3),
    )
    expect(pantryLocations.every((id) => id === LOC_A)).toBe(true)
  })

  it('user sees the recipe marked as cooked right after Done', async () => {
    // Given the recipe has never been cooked
    const { result } = renderCooking()
    await waitFor(() => expect(result.current.recipes.data).toHaveLength(1))
    expect(result.current.recipes.data?.[0]?.lastCookedAt).toBeUndefined()

    // When the user cooks it
    await result.current.consume.mutateAsync(cook)

    // Then the recipe list shows the new cooked date
    await waitFor(() =>
      expect(result.current.recipes.data?.[0]?.lastCookedAt).toEqual(
        new Date(COOKED_AT),
      ),
    )
  })
})

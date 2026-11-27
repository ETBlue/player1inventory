import { useApolloClient } from '@apollo/client/react'
import { MockedProvider } from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/cloudCache'
import {
  GetRecipesDocument,
  type GetRecipesQuery,
  ItemCountByRecipeDocument,
  SetItemRecipesDocument,
} from '@/generated/graphql'
import * as dataModeHooks from './useDataMode'
import { useItemCountByRecipe, useSetItemRecipes } from './useRecipes'

// The REAL generated hooks and the REAL `useApolloClient`, driven through
// `MockedProvider` (the same shape as `useUpdateRecipe.cloud.test.tsx`).
// `src/test/setup.ts` stubs both modules, so they are unmocked here.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)
vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

type CloudRecipe = {
  __typename: 'Recipe'
  id: string
  name: string
  items: { __typename: 'RecipeItem'; itemId: string; defaultAmount: number }[]
  lastCookedAt: string | null
}

let recipes: CloudRecipe[] = []
let served: Record<string, number> = {}
let sentVariables: Record<string, unknown>[] = []

function count(op: string) {
  served[op] = (served[op] ?? 0) + 1
}

// A stand-in for the server: the item joins every recipe in `recipeIds` and
// leaves every other one. Answers the recipes that changed.
function setItemRecipes(itemId: string, recipeIds: string[]) {
  const changed: CloudRecipe[] = []
  recipes = recipes.map((r) => {
    const holds = r.items.some((ri) => ri.itemId === itemId)
    const wanted = recipeIds.includes(r.id)
    if (holds === wanted) return r
    const next: CloudRecipe = {
      ...r,
      items: wanted
        ? [...r.items, { __typename: 'RecipeItem', itemId, defaultAmount: 1 }]
        : r.items.filter((ri) => ri.itemId !== itemId),
    }
    changed.push(next)
    return next
  })
  return changed
}

function mocks(recipesDelay = 0) {
  return [
    {
      request: { query: GetRecipesDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      // `delay` runs when the request is SENT; `result` when it is answered.
      delay: () => {
        count('GetRecipesSent')
        return recipesDelay
      },
      result: () => {
        count('GetRecipes')
        return { data: { recipes } }
      },
    },
    {
      request: {
        query: ItemCountByRecipeDocument,
        variables: { recipeId: 'r-2' },
      },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: () => {
        count('ItemCountByRecipe')
        const r = recipes.find((x) => x.id === 'r-2')
        return { data: { itemCountByRecipe: r?.items.length ?? 0 } }
      },
    },
    {
      request: { query: SetItemRecipesDocument, variables: () => true },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: (vars: Record<string, unknown>) => {
        count('SetItemRecipes')
        sentVariables.push(vars)
        return {
          data: {
            setItemRecipes: setItemRecipes(
              vars.itemId as string,
              vars.recipeIds as string[],
            ),
          },
        }
      },
    },
  ]
}

function renderSave(recipesDelay = 0) {
  const queryClient = new QueryClient()
  return renderHook(
    () => ({
      save: useSetItemRecipes(),
      count: useItemCountByRecipe('r-2'),
      client: useApolloClient(),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MockedProvider
          cache={createCache()}
          mocks={mocks(recipesDelay)}
          mockLinkDefaultOptions={{ delay: 0 }}
        >
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </MockedProvider>
      ),
    },
  )
}

const cachedItemIds = (
  client: ReturnType<typeof useApolloClient>,
  recipeId: string,
) =>
  client
    .readQuery<GetRecipesQuery>({ query: GetRecipesDocument })
    ?.recipes.find((r) => r.id === recipeId)
    ?.items.map((ri) => ri.itemId)

describe('useSetItemRecipes (cloud)', () => {
  beforeEach(() => {
    vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
      mode: 'cloud',
      setMode: vi.fn(),
    })
    recipes = [
      {
        __typename: 'Recipe',
        id: 'r-1',
        name: 'Bread',
        items: [
          { __typename: 'RecipeItem', itemId: 'item-1', defaultAmount: 2 },
        ],
        lastCookedAt: null,
      },
      {
        __typename: 'Recipe',
        id: 'r-2',
        name: 'Soup',
        items: [],
        lastCookedAt: null,
      },
    ]
    served = {}
    sentVariables = []
  })

  it("user's recipe Save sends one SetItemRecipes and waits for the recipe list", async () => {
    // Given the item is in Bread, and the Soup item count is on screen
    const { result } = renderSave()
    await waitFor(() => expect(result.current.count.data).toBe(0))

    // When the user saves the item into Soup only
    await result.current.save.mutateAsync({
      itemId: 'item-1',
      recipeIds: ['r-2'],
    })

    // Then ONE request was sent, with the item and the whole list
    expect(served.SetItemRecipes).toBe(1)
    expect(sentVariables).toEqual([{ itemId: 'item-1', recipeIds: ['r-2'] }])
    // And the recipe list was read again before the call resolved. Nothing
    // watches GetRecipes here, so only the awaited read can put it in the cache.
    expect(served.GetRecipes).toBe(1)
    expect(cachedItemIds(result.current.client, 'r-1')).toEqual([])
    expect(cachedItemIds(result.current.client, 'r-2')).toEqual(['item-1'])
    // And the mounted item count was read again too
    await waitFor(() => expect(result.current.count.data).toBe(1))
    expect(served.ItemCountByRecipe).toBe(2)
  })

  it('isPending stays true until the recipe list has been read again', async () => {
    // Given a recipe list that answers 100 ms after it is asked
    const { result } = renderSave(100)

    // When a save is sent and the server has answered it
    const save = result.current.save.mutateAsync({
      itemId: 'item-1',
      recipeIds: [],
    })
    await waitFor(() => expect(served.GetRecipesSent).toBe(1))

    // Then the hook still reports the save as pending while the read runs
    expect(served.SetItemRecipes).toBe(1)
    expect(result.current.save.isPending).toBe(true)

    // And once the read has landed it is not pending any more
    await save
    await waitFor(() => expect(result.current.save.isPending).toBe(false))
  })

  it('a refused save rejects', async () => {
    // Given a server that refuses the save
    const { result } = renderHook(() => useSetItemRecipes(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MockedProvider
          cache={createCache()}
          mocks={[
            {
              request: { query: SetItemRecipesDocument, variables: () => true },
              result: {
                errors: [
                  {
                    message: 'Only consumable items can be in a recipe.',
                    extensions: {
                      code: 'BAD_USER_INPUT',
                      reason: 'NOT_CONSUMABLE',
                    },
                  },
                ],
              },
            },
          ]}
          mockLinkDefaultOptions={{ delay: 0 }}
        >
          <QueryClientProvider client={new QueryClient()}>
            {children}
          </QueryClientProvider>
        </MockedProvider>
      ),
    })

    // When the save is sent, Then it rejects with the server's message
    await expect(
      result.current.mutateAsync({ itemId: 'item-1', recipeIds: ['r-2'] }),
    ).rejects.toThrow('Only consumable items')
  })
})

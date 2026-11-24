import { useApolloClient } from '@apollo/client/react'
import { MockedProvider } from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/cloudCache'
import {
  GetRecipeDocument,
  GetRecipesDocument,
  type GetRecipesQuery,
  UpdateRecipeDocument,
} from '@/generated/graphql'
import * as dataModeHooks from './useDataMode'
import { useUpdateRecipe } from './useRecipes'

// The REAL generated hooks and the REAL `useApolloClient`, driven through
// `MockedProvider`. `useRecipes.test.ts` stubs the mutation with `vi.fn`, so
// it cannot see what Apollo does when a read after the write fails.
//
// The bug (docs/global/bugs/2026-11-18-bug-failed-refetch-rejects-saved-write.md):
// with `awaitRefetchQueries: true`, one failed read REJECTED a write the
// server had saved, so the recipe items page kept its input and a second
// press created a second item.
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
// When true, `GetRecipes` fails with a GraphQL error. `GetRecipe` still works.
let failRecipes = false
let served: Record<string, number> = {}

function count(op: string) {
  served[op] = (served[op] ?? 0) + 1
}

const failure = {
  errors: [{ message: 'down', extensions: { code: 'INTERNAL_SERVER_ERROR' } }],
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
      result: () => (failRecipes ? failure : { data: { recipes } }),
    },
    {
      request: { query: GetRecipeDocument, variables: { id: 'r-1' } },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: () => ({ data: { recipe: recipes[0] } }),
    },
    {
      request: { query: UpdateRecipeDocument, variables: () => true },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: (vars: Record<string, unknown>) => {
        count('UpdateRecipe')
        const current = recipes[0] as CloudRecipe
        const next = { ...current, name: (vars.name as string) ?? current.name }
        recipes = [next]
        const { lastCookedAt: _, ...answer } = next
        return { data: { updateRecipe: answer } }
      },
    },
  ]
}

function makeWrapper(recipesDelay = 0) {
  const queryClient = new QueryClient()
  return ({ children }: { children: ReactNode }) => (
    <MockedProvider
      cache={createCache()}
      mocks={mocks(recipesDelay)}
      mockLinkDefaultOptions={{ delay: 0 }}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MockedProvider>
  )
}

function renderUpdate(recipesDelay = 0) {
  return renderHook(
    () => ({ update: useUpdateRecipe(), client: useApolloClient() }),
    { wrapper: makeWrapper(recipesDelay) },
  )
}

const cachedRecipeNames = (client: ReturnType<typeof useApolloClient>) =>
  client
    .readQuery<GetRecipesQuery>({ query: GetRecipesDocument })
    ?.recipes.map((r) => r.name)

describe('useUpdateRecipe (cloud) when the refresh after the save fails', () => {
  beforeEach(() => {
    vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
      mode: 'cloud',
      setMode: vi.fn(),
    })
    recipes = [
      {
        __typename: 'Recipe',
        id: 'r-1',
        name: 'Pancakes',
        items: [],
        lastCookedAt: null,
      },
    ]
    failRecipes = false
    served = {}
  })

  it("user's saved recipe change is not shown as failed when the refresh fails (mutateAsync)", async () => {
    // Given the recipe list cannot be read
    failRecipes = true
    const { result } = renderUpdate()

    // When the user renames the recipe, which the server saves
    const updated = await result.current.update.mutateAsync({
      id: 'r-1',
      updates: { name: 'Waffles' },
    })

    // Then the call resolves with the saved recipe
    expect(updated?.name).toBe('Waffles')
    expect(served.UpdateRecipe).toBe(1)
  })

  it("user's saved recipe change is not shown as failed when the refresh fails (mutate)", async () => {
    // Given the recipe list cannot be read
    failRecipes = true
    const { result } = renderUpdate()
    const onSuccess = vi.fn()
    const onError = vi.fn()

    // When the user renames the recipe through `mutate`
    await result.current.update.mutate(
      { id: 'r-1', updates: { name: 'Waffles' } },
      { onSuccess, onError },
    )

    // Then the success callback ran, not the error one
    expect(onSuccess).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
  })

  it('a failed recipe write still reaches onError', async () => {
    // Given a server that refuses the write
    const { result } = renderHook(() => useUpdateRecipe(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MockedProvider
          cache={createCache()}
          mocks={[
            {
              request: { query: UpdateRecipeDocument, variables: () => true },
              maxUsageCount: Number.POSITIVE_INFINITY,
              result: {
                errors: [{ message: 'no', extensions: { code: 'FORBIDDEN' } }],
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
    const onSuccess = vi.fn()
    const onError = vi.fn()

    // When the user renames the recipe through both entry points
    await result.current.mutate(
      { id: 'r-1', updates: { name: 'Waffles' } },
      { onSuccess, onError },
    )
    const viaAsync = result.current.mutateAsync({
      id: 'r-1',
      updates: { name: 'Waffles' },
    })

    // Then both report the failure
    expect(onError).toHaveBeenCalledOnce()
    expect(onSuccess).not.toHaveBeenCalled()
    await expect(viaAsync).rejects.toThrow('no')
  })

  // Controls: the call still WAITS for the read. Nothing is mounted but the
  // hook, so only the awaited read can put `GetRecipes` in the cache.
  it('mutateAsync resolves only after the recipe list has been read again', async () => {
    const { result } = renderUpdate()

    await result.current.update.mutateAsync({
      id: 'r-1',
      updates: { name: 'Waffles' },
    })

    expect(cachedRecipeNames(result.current.client)).toEqual(['Waffles'])
  })

  it('mutate calls onSuccess only after the recipe list has been read again', async () => {
    const { result } = renderUpdate()
    let namesAtSuccess: string[] | undefined
    const client = result.current.client

    await result.current.update.mutate(
      { id: 'r-1', updates: { name: 'Waffles' } },
      {
        onSuccess: () => {
          namesAtSuccess = cachedRecipeNames(client)
        },
      },
    )

    expect(namesAtSuccess).toEqual(['Waffles'])
  })

  it('isPending stays true until the recipe list has been read again', async () => {
    // Given a recipe list that answers 100 ms after it is asked
    const { result } = renderUpdate(100)

    // When a save is sent and the server has answered it
    const save = result.current.update.mutateAsync({
      id: 'r-1',
      updates: { name: 'Waffles' },
    })
    await waitFor(() => expect(served.GetRecipesSent).toBe(1))

    // Then the hook still reports the save as pending while the read runs.
    // The item Recipes tab keeps its badge busy on this flag, so a second
    // press cannot start from the old recipe list.
    expect(served.UpdateRecipe).toBe(1)
    expect(result.current.update.isPending).toBe(true)

    // And once the read has landed it is not pending any more
    await save
    await waitFor(() => expect(result.current.update.isPending).toBe(false))
  })
})

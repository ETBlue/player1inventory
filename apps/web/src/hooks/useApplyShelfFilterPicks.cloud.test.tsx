import { useApolloClient } from '@apollo/client/react'
import { MockedProvider } from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/cloudCache'
import {
  ApplyShelfFilterPicksDocument,
  GetItemsDocument,
  type GetItemsQuery,
  GetRecipesDocument,
} from '@/generated/graphql'
import { cloudItem } from '@/test/cloudFixtures'
import type { PantryItem } from '@/types'
import { useApplyShelfFilterPicks } from './useApplyShelfFilterPicks'
import * as dataModeHooks from './useDataMode'

// The REAL generated hooks and the REAL `useApolloClient`, driven through
// `MockedProvider`. The bug (docs/global/bugs/
// 2026-11-18-bug-failed-refetch-rejects-saved-write.md): with
// `awaitRefetchQueries: true`, one failed read REJECTED a write the server had
// saved, and the shelf filter dialog showed an inline error.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)
vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

const MILK = cloudItem('item-milk', 'Milk')

let tagIds: string[] = []
// When true, `GetItems` fails with a GraphQL error.
let failItems = false
let applied = 0

const MOCKS = [
  {
    request: { query: GetItemsDocument },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () =>
      failItems
        ? {
            errors: [
              {
                message: 'down',
                extensions: { code: 'INTERNAL_SERVER_ERROR' },
              },
            ],
          }
        : { data: { items: [{ ...MILK, tagIds }] } },
  },
  {
    request: { query: GetRecipesDocument },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: { data: { recipes: [] } },
  },
  {
    request: { query: ApplyShelfFilterPicksDocument, variables: () => true },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: (vars: Record<string, unknown>) => {
      applied += 1
      const input = vars.input as { addTagIds: string[] }
      tagIds = [...tagIds, ...input.addTagIds]
      return {
        data: {
          applyShelfFilterPicks: { __typename: 'Item', id: 'item-milk' },
        },
      }
    },
  },
]

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MockedProvider
      cache={createCache()}
      mocks={MOCKS}
      mockLinkDefaultOptions={{ delay: 0 }}
    >
      <QueryClientProvider client={new QueryClient()}>
        {children}
      </QueryClientProvider>
    </MockedProvider>
  )
}

// Only `item.id` is read (see `ApplyShelfFilterPicksVars`).
const ITEM = { id: 'item-milk' } as PantryItem

const PICKS = { item: ITEM, addTagIds: ['tag-dairy'], addVendorIds: [] }

describe('useApplyShelfFilterPicks (cloud) when the refresh fails', () => {
  beforeEach(() => {
    vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
      mode: 'cloud',
      setMode: vi.fn(),
    })
    tagIds = []
    failItems = false
    applied = 0
  })

  it("user's shelf picks are not shown as failed when the refresh fails", async () => {
    // Given the item list cannot be read
    failItems = true
    const { result } = renderHook(() => useApplyShelfFilterPicks(), {
      wrapper,
    })

    // When the user applies a shelf's picks, which the server saves
    await result.current.mutateAsync(PICKS)

    // Then the call resolved, and the picks were saved once
    expect(applied).toBe(1)
    expect(tagIds).toEqual(['tag-dairy'])
  })

  it('a failed apply still rejects', async () => {
    const { result } = renderHook(() => useApplyShelfFilterPicks(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MockedProvider
          cache={createCache()}
          mocks={[
            {
              request: {
                query: ApplyShelfFilterPicksDocument,
                variables: () => true,
              },
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

    await expect(result.current.mutateAsync(PICKS)).rejects.toThrow('no')
  })

  it('mutateAsync resolves only after the item list has been read again', async () => {
    // Control: nothing is mounted but the hook, so only the awaited read can
    // put `GetItems` in the cache. The shelf filter dialog works out the axes
    // again from this list after its `await`.
    const { result } = renderHook(
      () => ({ apply: useApplyShelfFilterPicks(), client: useApolloClient() }),
      { wrapper },
    )

    await result.current.apply.mutateAsync(PICKS)

    expect(
      result.current.client.readQuery<GetItemsQuery>({
        query: GetItemsDocument,
      })?.items[0]?.tagIds,
    ).toEqual(['tag-dairy'])
  })
})

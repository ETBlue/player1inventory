import type { ApolloClient } from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApolloClient, createApolloClientForE2E } from '@/apollo/client'
import { cloudCache } from '@/apollo/cloudCache'
import * as dataModeHooks from './useDataMode'
import { useCreateTagType, useTagTypes } from './useTags'

// The race from `docs/global/bugs/2026-11-01-bug-refetch-joins-stale-query.md`,
// run through the app's REAL Apollo clients. Only `fetch` is fake.
//
// THE ORDER IS THE TEST. The page's first `GetTagTypes` is sent, and is still
// waiting for its answer, when `CreateTagType` comes back. That first answer
// was read before the create was saved, so it holds no tag types. Apollo
// joins the mutation's refetch onto that same request (`queryDeduplication`),
// so without a fix the list ends up empty and nothing asks the server again.
// A test where the list loads BEFORE the create passes with or without the fix.

// Restore the REAL generated Apollo hooks and `ApolloProvider` context.
// `src/test/setup.ts` stubs both, and a stub never sends a request.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)
vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

type TagTypeRow = {
  __typename: 'TagType'
  id: string
  name: string
  color: string
}

/**
 * A fake GraphQL server behind `fetch`.
 *
 * The FIRST `GetTagTypes` is held until `releaseFirstList` is called, and it
 * answers with the list as it was when the request arrived — before the
 * create. Every later `GetTagTypes` answers at once with the current list.
 */
function fakeServer() {
  const saved: TagTypeRow[] = []
  const operations: string[] = []
  let releaseFirstList: () => void = () => {
    throw new Error('the first GetTagTypes was never sent')
  }

  const json = (data: unknown) =>
    new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      operationName: string
      variables: { name?: string; color?: string }
    }
    operations.push(body.operationName)

    if (body.operationName === 'GetTagTypes') {
      const snapshot = [...saved]
      const isFirst =
        operations.filter((op) => op === 'GetTagTypes').length === 1
      if (isFirst) {
        return new Promise<Response>((resolve) => {
          releaseFirstList = () => resolve(json({ tagTypes: snapshot }))
        })
      }
      return json({ tagTypes: snapshot })
    }

    if (body.operationName === 'CreateTagType') {
      const row: TagTypeRow = {
        __typename: 'TagType',
        id: `tt-${saved.length + 1}`,
        name: body.variables.name ?? '',
        color: body.variables.color ?? 'teal',
      }
      saved.push(row)
      return json({ createTagType: row })
    }

    throw new Error(`fake server has no answer for ${body.operationName}`)
  })

  return {
    fetchImpl,
    operations,
    releaseFirstList: () => releaseFirstList(),
  }
}

function wrapperFor(client: ApolloClient) {
  const queryClient = new QueryClient()
  return ({ children }: { children: ReactNode }) => (
    <ApolloProvider client={client}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApolloProvider>
  )
}

describe('a tag type created while the list is still loading', () => {
  beforeEach(() => {
    vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
      mode: 'cloud',
      setMode: vi.fn(),
    })
    // The production client writes into the module-level `cloudCache`.
    cloudCache.reset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['production', () => createApolloClient(async () => null)],
    ['e2e', () => createApolloClientForE2E('e2e-user')],
  ])('user sees the new tag type in the list (%s client)', async (_name, makeClient) => {
    // Given the tags page has asked for the list, and the answer is slow
    const server = fakeServer()
    vi.stubGlobal('fetch', server.fetchImpl)
    const { result } = renderHook(
      () => ({ list: useTagTypes(), create: useCreateTagType() }),
      { wrapper: wrapperFor(makeClient()) },
    )
    await waitFor(() => expect(server.operations).toEqual(['GetTagTypes']))

    // When the user creates "Protein" and the create answers first
    const onSuccess = vi.fn()
    act(() => {
      result.current.create.mutate({ name: 'Protein' }, { onSuccess })
    })
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))

    // And only then the old list answer arrives, without "Protein"
    act(() => server.releaseFirstList())

    // Then the list still ends up showing "Protein"
    await waitFor(() =>
      expect(result.current.list.data?.map((t) => t.name)).toEqual(['Protein']),
    )

    // And it got there by asking the server again after the create
    expect(server.operations).toEqual([
      'GetTagTypes',
      'CreateTagType',
      'GetTagTypes',
    ])
  })
})

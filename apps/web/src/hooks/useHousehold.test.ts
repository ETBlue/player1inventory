import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHousehold, useRenameHousehold } from './useHousehold'

// `useHousehold` and `useRenameHousehold` over a stubbed generated hook
// (households H3a, task 3.13). The query stub records the options it is given
// and honours `skip` the way Apollo does: a skipped query has no data.

type QueryOptions = { skip?: boolean; fetchPolicy?: string }
type QueryResult = { data?: unknown; loading: boolean; error?: unknown }

const mockQuery = vi.fn<(options: QueryOptions) => QueryResult>()
const mockRename = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetHouseholdQuery: (options: QueryOptions) => {
      const result = mockQuery(options)
      return options.skip ? { data: undefined, loading: false } : result
    },
    useRenameHouseholdMutation: () => [mockRename, { loading: false }],
  }
})

const HOUSEHOLD = {
  __typename: 'Household' as const,
  id: 'household-1',
  name: 'The Lab',
  role: 'owner' as const,
}

beforeEach(() => {
  mockQuery.mockReturnValue({ data: { household: HOUSEHOLD }, loading: false })
})

afterEach(() => {
  localStorage.removeItem('data-mode')
  vi.resetAllMocks()
})

describe('useHousehold', () => {
  it('sends no request in local mode and returns no household', () => {
    // Given local mode, and a stub that WOULD answer with a household
    localStorage.setItem('data-mode', 'local')

    const { result } = renderHook(() => useHousehold())

    // Then the query is skipped and nothing comes back
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    )
    expect(result.current).toEqual({
      data: undefined,
      isLoading: false,
      isError: false,
    })
  })

  it('reads the household in cloud mode, asking the network on every mount', () => {
    localStorage.setItem('data-mode', 'cloud')

    const { result } = renderHook(() => useHousehold())

    expect(mockQuery).toHaveBeenCalledWith({
      skip: false,
      fetchPolicy: 'cache-and-network',
    })
    expect(result.current.data).toEqual(HOUSEHOLD)
    expect(result.current.isLoading).toBe(false)
  })

  it('reports loading only while there is nothing to show', () => {
    localStorage.setItem('data-mode', 'cloud')

    // A refetch over a cached name: loading, but data is there
    mockQuery.mockReturnValue({ data: { household: HOUSEHOLD }, loading: true })
    expect(renderHook(() => useHousehold()).result.current.isLoading).toBe(
      false,
    )

    // The first load: nothing to show yet
    mockQuery.mockReturnValue({ data: undefined, loading: true })
    expect(renderHook(() => useHousehold()).result.current.isLoading).toBe(true)
  })

  it('reports an error only when there is nothing to show', () => {
    localStorage.setItem('data-mode', 'cloud')

    // Offline over a cached name: not an error
    mockQuery.mockReturnValue({
      data: { household: HOUSEHOLD },
      loading: false,
      error: new Error('offline'),
    })
    expect(renderHook(() => useHousehold()).result.current.isError).toBe(false)

    // Nothing cached and the request failed: an error
    mockQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('offline'),
    })
    expect(renderHook(() => useHousehold()).result.current.isError).toBe(true)
  })
})

describe('useRenameHousehold', () => {
  it('sends the name and calls onSuccess', async () => {
    mockRename.mockResolvedValue({ data: { renameHousehold: HOUSEHOLD } })
    const onSuccess = vi.fn()
    const onError = vi.fn()

    const { result } = renderHook(() => useRenameHousehold())
    await result.current.mutate('The Lab', { onSuccess, onError })

    expect(mockRename).toHaveBeenCalledWith({ variables: { name: 'The Lab' } })
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('hands a rejection to onError and does not throw', async () => {
    const failure = new Error('refused')
    mockRename.mockRejectedValue(failure)
    const onSuccess = vi.fn()
    const onError = vi.fn()

    const { result } = renderHook(() => useRenameHousehold())
    await result.current.mutate('The Lab', { onSuccess, onError })

    expect(onError).toHaveBeenCalledWith(failure)
    expect(onSuccess).not.toHaveBeenCalled()
  })
})

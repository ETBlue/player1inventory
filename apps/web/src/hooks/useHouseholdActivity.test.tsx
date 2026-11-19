import { MockedProvider } from '@apollo/client/testing/react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { Fragment, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/cloudCache'
import {
  HouseholdActivityDocument,
  type HouseholdActivityQuery,
} from '@/generated/graphql'
import { elementAt } from '@/test/narrow'
import {
  ACTIVITY_PAGE_SIZE,
  useHouseholdActivity,
} from './useHouseholdActivity'

// The activity log hook (households H6, task J.5). Real Apollo through
// `MockedProvider` and the real cache policy (`createCache`), so a page is a
// real request and "Load more" really goes through the field policy.
// `src/test/setup.ts` stubs the generated hooks; this file puts the real
// module back.

vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

type Entry = HouseholdActivityQuery['householdActivity'][number]

function entry(n: number): Entry {
  // Newest first: a smaller n is newer.
  const minute = String(59 - (n % 60)).padStart(2, '0')
  return {
    __typename: 'HouseholdActivityEntry',
    id: `act-${String(1000 - n).padStart(4, '0')}`,
    action: 'INVITE_CREATED',
    createdAt: `2026-11-20T10:${minute}:00.000Z`,
    actorName: 'Olive',
    actorIsMe: true,
    actorDeleted: false,
    targetName: null,
    targetIsMe: null,
    targetDeleted: null,
    locationName: null,
    fromRole: null,
    toRole: null,
    householdRole: 'member',
    count: null,
    importCounts: null,
  }
}

const NO_CODE = { errors: [{ message: 'down' }] }
const FORBIDDEN = {
  errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
}

// What the fake server holds, newest first, and every request it got.
let log: Entry[] = []
let answer: 'ok' | 'forbidden' | 'network' = 'ok'
let failBefore = false
let requests: { before?: string | null; first?: number | null }[] = []

/** A delay on every read, so a second "Load more" can arrive while one runs. */
const READ_DELAY = 20

// Changing this and calling `rerender` mounts the hook again under the SAME
// Apollo client and cache (MockedProvider keeps its client across renders).
let mountKey = 0

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MockedProvider
      cache={createCache()}
      mocks={[
        {
          request: { query: HouseholdActivityDocument, variables: () => true },
          maxUsageCount: Number.POSITIVE_INFINITY,
          delay: READ_DELAY,
          result: (vars: { before?: string | null; first?: number | null }) => {
            requests.push({ ...vars })
            if (answer === 'forbidden') return FORBIDDEN
            // An error with no code, the way the hook sees a network error
            if (answer === 'network' || (failBefore && vars.before)) {
              return NO_CODE
            }
            const start = vars.before
              ? log.findIndex((e) => e.id === vars.before) + 1
              : 0
            const first = vars.first ?? 50
            return {
              data: { householdActivity: log.slice(start, start + first) },
            }
          },
        },
      ]}
    >
      <Fragment key={mountKey}>{children}</Fragment>
    </MockedProvider>
  )
}

function serverHolds(count: number) {
  log = Array.from({ length: count }, (_, i) => entry(i))
}

beforeEach(() => {
  localStorage.setItem('data-mode', 'cloud')
  serverHolds(3)
  answer = 'ok'
  failBefore = false
  requests = []
  mountKey = 0
})

afterEach(() => {
  localStorage.removeItem('data-mode')
})

describe('useHouseholdActivity', () => {
  it('user sees the household log, newest first', async () => {
    const { result } = renderHook(() => useHouseholdActivity(), { wrapper })

    // Then it loads first, with nothing to show
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()

    // And then it gives the rows in the server's order
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.map((e) => e.id)).toEqual(log.map((e) => e.id))
    expect(result.current.isError).toBe(false)
    expect(result.current.errorCode).toBeUndefined()
    // And it asked for one page, from the top
    expect(requests).toEqual([{ first: ACTIVITY_PAGE_SIZE }])
  })

  it('a FORBIDDEN answer gives the code FORBIDDEN', async () => {
    // Given the caller is a household member
    answer = 'forbidden'
    const { result } = renderHook(() => useHouseholdActivity(), { wrapper })

    // Then the page can tell "no access" from a failed read
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.errorCode).toBe('FORBIDDEN')
    expect(result.current.isLoading).toBe(false)
  })

  it('a network error gives no code', async () => {
    answer = 'network'
    const { result } = renderHook(() => useHouseholdActivity(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.errorCode).toBeUndefined()
  })

  it('a page shorter than the page size has no more rows', async () => {
    const { result } = renderHook(() => useHouseholdActivity(), { wrapper })
    await waitFor(() => expect(result.current.data).toHaveLength(3))
    expect(result.current.hasMore).toBe(false)
  })

  it('a short first page still means the end after a refetch adds new rows on top', async () => {
    // Given the whole log is shorter than one page
    serverHolds(ACTIVITY_PAGE_SIZE - 5)
    const oldest = elementAt(log, log.length - 1).id
    const { result } = renderHook(() => useHouseholdActivity(), { wrapper })
    await waitFor(() =>
      expect(result.current.data).toHaveLength(ACTIVITY_PAGE_SIZE - 5),
    )
    expect(result.current.hasMore).toBe(false)

    // When 10 new rows are written and the first page is read again
    const newer = Array.from({ length: 10 }, (_, i) => ({
      ...entry(0),
      id: `new-${String(i).padStart(2, '0')}`,
    }))
    log = [...newer, ...log]
    act(() => result.current.refetch())

    // Then the new rows are on top and the old rows stay below them
    await waitFor(() =>
      expect(result.current.data).toHaveLength(ACTIVITY_PAGE_SIZE + 5),
    )
    expect(elementAt(result.current.data ?? [], 0).id).toBe('new-00')
    expect(
      elementAt(result.current.data ?? [], ACTIVITY_PAGE_SIZE + 4).id,
    ).toBe(oldest)
    // And the list still ends at the oldest row: no Load more
    expect(result.current.hasMore).toBe(false)
  })

  it('the end of the log is remembered when the page is opened again', async () => {
    // Given the user loaded the whole log, longer than one page
    serverHolds(ACTIVITY_PAGE_SIZE + 3)
    const { result, rerender } = renderHook(() => useHouseholdActivity(), {
      wrapper,
    })
    await waitFor(() => expect(result.current.hasMore).toBe(true))
    await act(async () => {
      await result.current.loadMore()
    })
    await waitFor(() => expect(result.current.hasMore).toBe(false))

    // When the page is left and opened again, with the list in the cache
    requests = []
    mountKey = 1
    rerender()

    // Then the first page is read again from the network
    await waitFor(() => expect(requests).toHaveLength(1))
    await new Promise((r) => setTimeout(r, READ_DELAY * 2))
    expect(result.current.data).toHaveLength(ACTIVITY_PAGE_SIZE + 3)
    // And there is still no Load more
    expect(result.current.hasMore).toBe(false)
  })

  it('user can load more, and the next page is asked after the last row', async () => {
    // Given the server holds a full page and 3 rows more
    serverHolds(ACTIVITY_PAGE_SIZE + 3)
    const { result } = renderHook(() => useHouseholdActivity(), { wrapper })
    await waitFor(() =>
      expect(result.current.data).toHaveLength(ACTIVITY_PAGE_SIZE),
    )

    // Then a full page may have more
    expect(result.current.hasMore).toBe(true)
    const lastId = result.current.data?.[ACTIVITY_PAGE_SIZE - 1]?.id

    // When the user loads more
    await act(async () => {
      await result.current.loadMore()
    })

    // Then the next page was asked after the last row shown
    expect(elementAt(requests, requests.length - 1)).toEqual({
      before: lastId,
      first: ACTIVITY_PAGE_SIZE,
    })
    // And its rows come after the first page, in order
    await waitFor(() =>
      expect(result.current.data?.map((e) => e.id)).toEqual(
        log.map((e) => e.id),
      ),
    )
    // And a short page means there is nothing more
    expect(result.current.hasMore).toBe(false)
  })

  it('a full page that ends the log shows no Load more after the empty page after it', async () => {
    // Given exactly one full page
    serverHolds(ACTIVITY_PAGE_SIZE)
    const { result } = renderHook(() => useHouseholdActivity(), { wrapper })
    await waitFor(() => expect(result.current.hasMore).toBe(true))

    // When the user loads more and nothing comes back
    await act(async () => {
      await result.current.loadMore()
    })

    // Then there is nothing more, and the list is unchanged
    await waitFor(() => expect(result.current.hasMore).toBe(false))
    expect(result.current.data).toHaveLength(ACTIVITY_PAGE_SIZE)
  })

  it('a second Load more while the first runs sends nothing and shares its promise', async () => {
    serverHolds(ACTIVITY_PAGE_SIZE + 3)
    const { result } = renderHook(() => useHouseholdActivity(), { wrapper })
    await waitFor(() => expect(result.current.hasMore).toBe(true))
    requests = []

    let first: Promise<void> | undefined
    let second: Promise<void> | undefined
    await act(async () => {
      first = result.current.loadMore()
      second = result.current.loadMore()
      await Promise.all([first, second])
    })

    expect(second).toBe(first)
    expect(requests).toHaveLength(1)
  })

  it('isLoadingMore is true while the next page loads and false after', async () => {
    serverHolds(ACTIVITY_PAGE_SIZE + 3)
    const { result } = renderHook(() => useHouseholdActivity(), { wrapper })
    await waitFor(() => expect(result.current.hasMore).toBe(true))
    expect(result.current.isLoadingMore).toBe(false)

    let pending: Promise<void> | undefined
    act(() => {
      pending = result.current.loadMore()
    })
    await waitFor(() => expect(result.current.isLoadingMore).toBe(true))
    await act(async () => {
      await pending
    })
    expect(result.current.isLoadingMore).toBe(false)
  })

  it('a failed Load more does not reject, and keeps the rows shown', async () => {
    // Given the next page cannot be read
    serverHolds(ACTIVITY_PAGE_SIZE + 3)
    failBefore = true
    const { result } = renderHook(() => useHouseholdActivity(), { wrapper })
    await waitFor(() => expect(result.current.hasMore).toBe(true))

    // When the user loads more, then the call resolves
    await act(async () => {
      await expect(result.current.loadMore()).resolves.toBeUndefined()
    })

    // And the first page is still shown, and the user may try again
    expect(result.current.data).toHaveLength(ACTIVITY_PAGE_SIZE)
    expect(result.current.loadMoreFailed).toBe(true)
    expect(result.current.hasMore).toBe(true)
  })

  it('local mode reads nothing', async () => {
    // Local mode has no activity log
    localStorage.setItem('data-mode', 'local')
    const { result } = renderHook(() => useHouseholdActivity(), { wrapper })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeUndefined()
    expect(result.current.hasMore).toBe(false)
    await act(async () => {
      await result.current.loadMore()
    })
    await new Promise((r) => setTimeout(r, READ_DELAY * 2))
    expect(requests).toEqual([])
  })
})

import { useEffect, useRef, useState } from 'react'
import {
  type HouseholdActivityQuery,
  useHouseholdActivityQuery,
} from '@/generated/graphql'
import { graphQLErrorCode } from '@/lib/graphqlErrorCode'
import { useDataMode } from './useDataMode'

// The household activity log (households H6, task J.5; decisions T53, T54).
// Cloud only: local mode has no roles and no log.

export type ActivityEntry = HouseholdActivityQuery['householdActivity'][number]

/** How many rows one page asks for. The server's default is the same. */
export const ACTIVITY_PAGE_SIZE = 50

// The id of the OLDEST row of the log, once the hook has seen it, per Apollo
// client. It lives outside the component so a page opened again (a remount,
// with the whole list still in the cache) still knows where the log ends.
//
// It is safe to keep: log rows are never deleted (only with the household,
// decision T48), and a new row is always newer. So once a row is the oldest,
// it stays the oldest. Ids are `cuid()`, so an id from another household or
// another account never matches a row of this one.
const oldestIdByClient = new WeakMap<object, string>()

/**
 * The log of the caller's household, newest first. Owner and manager only:
 * anyone else gets `FORBIDDEN` (decision T54).
 *
 * `cache-and-network` with the usual pair of rules (`hooks/CLAUDE.md`).
 * `errorCode` is the `extensions.code` of the last failed read, or
 * `undefined` for a network error, so the page can tell "you have no access"
 * (`FORBIDDEN`) from "could not load, try again". Like
 * `useLocationPeople().errorCode`, it is NOT tied to `data`: a manager
 * demoted in another tab keeps the old rows in `data`, `isError` stays
 * `false`, and only `errorCode` says `FORBIDDEN`. The page reads `errorCode`
 * for "no access".
 *
 * **Pages.** The first read asks for `ACTIVITY_PAGE_SIZE` rows. `loadMore()`
 * asks for the next page after the last row shown (`before:` its id), and the
 * `householdActivity` field policy (`mergeActivityPage` in
 * `apollo/cloudCache.ts`) adds it to the list. A live event or a write reads
 * the FIRST page again: new rows go on top, and the pages already loaded
 * stay.
 *
 * A refetch MERGES (`refetchWritePolicy: 'merge'`). Apollo's default for a
 * refetch is to overwrite, which would hand the field policy no old list and
 * drop every page already loaded.
 *
 * `hasMore` is `false` once the hook knows the OLDEST row of the log, and
 * that row is the last row shown. It learns it in two ways: a list shorter
 * than a full page (a first page that short is the whole log), or a short
 * "Load more" page. It is remembered per Apollo client (`oldestIdByClient`),
 * so a refetch that adds new rows on top, or the page opened again, does not
 * offer one "Load more" that would bring nothing.
 *
 * `loadMore()` never rejects. A failed page sets `loadMoreFailed` (the page
 * may offer to try again); the rows shown stay. A second `loadMore()` while
 * one runs gets the same promise and sends nothing.
 *
 * `refetch` reads the first page again (a Retry after a network error). It
 * never rejects.
 */
export function useHouseholdActivity(): {
  data: ActivityEntry[] | undefined
  isLoading: boolean
  isError: boolean
  errorCode: string | undefined
  hasMore: boolean
  loadMore: () => Promise<void>
  isLoadingMore: boolean
  loadMoreFailed: boolean
  refetch: () => void
} {
  const { mode } = useDataMode()
  const skip = mode !== 'cloud'
  const cloud = useHouseholdActivityQuery({
    variables: { first: ACTIVITY_PAGE_SIZE },
    skip,
    fetchPolicy: 'cache-and-network',
    refetchWritePolicy: 'merge',
  })
  // `client` is missing only under the test stubs of `src/test/setup.ts`.
  const client: object | undefined = cloud.client
  // The id of the oldest row, once known. `undefined`: not known yet.
  const [oldestId, setOldestId] = useState<string | undefined>(() =>
    client ? oldestIdByClient.get(client) : undefined,
  )
  const markOldest = (id: string) => {
    if (client) oldestIdByClient.set(client, id)
    setOldestId(id)
  }
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadMoreFailed, setLoadMoreFailed] = useState(false)
  const loadMoreRef = useRef<Promise<void> | null>(null)

  const rows = skip ? undefined : cloud.data?.householdActivity
  const lastId = rows?.[rows.length - 1]?.id
  const shortList = rows !== undefined && rows.length < ACTIVITY_PAGE_SIZE

  // A list shorter than a full page came from a first page that short, so
  // it is the whole log, and its last row is the oldest row there is.
  // biome-ignore lint/correctness/useExhaustiveDependencies: markOldest is a fresh function each render; the effect only needs to run when the list's end changes
  useEffect(() => {
    if (shortList && lastId !== undefined && lastId !== oldestId) {
      markOldest(lastId)
    }
  }, [shortList, lastId, oldestId])

  const loadMore = (): Promise<void> => {
    if (skip || lastId === undefined) return Promise.resolve()
    if (loadMoreRef.current) return loadMoreRef.current
    setIsLoadingMore(true)
    setLoadMoreFailed(false)
    const promise = cloud
      .fetchMore({ variables: { before: lastId, first: ACTIVITY_PAGE_SIZE } })
      .then(
        (result) => {
          const page = result.data?.householdActivity ?? []
          if (page.length < ACTIVITY_PAGE_SIZE) {
            markOldest(page[page.length - 1]?.id ?? lastId)
          }
        },
        () => {
          setLoadMoreFailed(true)
        },
      )
      .finally(() => {
        loadMoreRef.current = null
        setIsLoadingMore(false)
      })
    loadMoreRef.current = promise
    return promise
  }

  const refetch = () => {
    if (!skip) cloud.refetch().catch(() => {})
  }

  if (skip) {
    return {
      data: undefined,
      isLoading: false,
      isError: false,
      errorCode: undefined,
      hasMore: false,
      loadMore,
      isLoadingMore: false,
      loadMoreFailed: false,
      refetch,
    }
  }

  // A first page shorter than a full page is the whole log. Its last row, or
  // the last row of a short "Load more" page, is the oldest row: once that
  // row is the last one shown, there is nothing more.
  const hasMore = rows !== undefined && !shortList && lastId !== oldestId

  return {
    data: rows,
    isLoading: cloud.loading && !cloud.data,
    isError: !!cloud.error && !cloud.data,
    errorCode: cloud.error ? graphQLErrorCode(cloud.error) : undefined,
    hasMore,
    loadMore,
    isLoadingMore,
    loadMoreFailed,
    refetch,
  }
}

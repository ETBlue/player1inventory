import { useRef, useState } from 'react'
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
 * `hasMore` is `false` when a page came back shorter than a full page. It is
 * remembered by the id of the last row then: when a refetch changes the last
 * row (it replaced the list), `hasMore` is `true` again.
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
  })
  // The id of the last row when a short page said "nothing more". `null`:
  // no short page was seen yet.
  const [endAfterId, setEndAfterId] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadMoreFailed, setLoadMoreFailed] = useState(false)
  const loadMoreRef = useRef<Promise<void> | null>(null)

  const rows = skip ? undefined : cloud.data?.householdActivity
  const lastId = rows?.[rows.length - 1]?.id

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
            setEndAfterId(page[page.length - 1]?.id ?? lastId)
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

  // A first page shorter than a full page is the whole log. After that, a
  // short "Load more" page marks the end by its last row.
  const hasMore =
    rows !== undefined &&
    rows.length >= ACTIVITY_PAGE_SIZE &&
    lastId !== endAfterId

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

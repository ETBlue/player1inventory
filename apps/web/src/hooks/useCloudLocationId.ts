import { useApolloClient } from '@apollo/client/react'
import { useCallback } from 'react'
import {
  GetLocationsDocument,
  type GetLocationsQuery,
} from '@/generated/graphql'
import { DEFAULT_LOCATION_ID } from '@/types'
import { useActiveLocation } from './useActiveLocation'

// Resolve the location a CLOUD write should target, at CALL time rather than at
// render time.
//
// Why this exists — a real bug, found by cloud E2E on 2026-09-04. On a fresh
// cloud session there is no `active-location-id:cloud` slot, so
// `readStoredLocationId('cloud')` hands back `DEFAULT_LOCATION_ID` — the local
// `'local'` sentinel, which names no cloud `Location`. `ActiveLocationProvider`
// corrects it to the first location, but only once `GetLocations` has
// resolved. Anything the user does inside that window reads `'local'`, and a
// location-scoped WRITE sent with it is rejected by `requireLocationRole` with
// `FORBIDDEN`.
//
// That was not hypothetical: creating an item from the pantry's Add dialog
// immediately after load created the `Item`, had its follow-up
// `upsertItemStock(locationId: "local")` refused, and left the dialog hanging
// with the item created but stocked nowhere. Thirteen cloud E2E specs failed on
// it. A READ in that window merely re-runs with the corrected id; a write is
// lost.
//
// The provider's correction cannot fix this on its own — it is state, and a
// handler that already started reads the value from the render it started in.
// So the write path asks Apollo directly, `cache-first`: a hit costs nothing
// (the provider's own `useLocations()` has the list), a miss awaits the
// in-flight request instead of firing a doomed mutation.
//
// Never returns the `'local'` sentinel (households H5, review of task F.7).
// Since F.7 a cloud household can have no location at all. Before that review
// this hook then handed back the sentinel, and every cloud write sent it: an
// owner creating a vendor was refused with FORBIDDEN and told "Only a household
// owner or manager can add a vendor." Now it returns `undefined` when it has no
// real cloud location to give:
// - the list loaded and holds no location (an empty household);
// - the read failed or gave no data (a stubbed client in a unit test, an
//   offline cache) AND the active id is still the sentinel.
// If the read fails while the active id is a real cloud id, that id is
// returned, as before.
//
// The caller decides what `undefined` means:
// - `createVendor` sends no `locationId`, and the server writes no cart;
// - `createItem` keeps the item in the catalog and stocks it nowhere;
// - `applyUnitSwitch` skips only the pantry refetch it names;
// - every other write uses `useRequiredCloudLocationId`, which throws
//   `NoCloudLocationError` before anything is sent.
export function useCloudLocationId(): (
  explicit?: string,
) => Promise<string | undefined> {
  const { activeLocationId } = useActiveLocation()
  const client = useApolloClient()

  return useCallback(
    async (explicit?: string) => {
      // The Stock-tab pager names the location whose page is on screen, and it
      // can only have come from the loaded list. Trust it and skip the read.
      if (explicit) return explicit
      try {
        const { data } = await client.query<GetLocationsQuery>({
          query: GetLocationsDocument,
          fetchPolicy: 'cache-first',
        })
        const list = data?.locations ?? []
        if (list.some((loc) => loc.id === activeLocationId)) {
          return activeLocationId
        }
        // A household has no default location (task 3.12). The fallback is
        // the FIRST location: the server returns the list by `order`, so this
        // is the same location `ActiveLocationProvider` falls back to.
        const fallback = list[0]?.id
        if (fallback) return fallback
      } catch {
        // Fall through — a failed read must not turn into a failed write with
        // a *different* error than the one the caller would otherwise get.
      }
      return activeLocationId === DEFAULT_LOCATION_ID
        ? undefined
        : activeLocationId
    },
    [client, activeLocationId],
  )
}

/**
 * Thrown by `useRequiredCloudLocationId` when a cloud write needs a location
 * and the household has none. Nothing has been sent when it is thrown.
 */
export class NoCloudLocationError extends Error {
  constructor() {
    super('This household has no location to write to.')
    this.name = 'NoCloudLocationError'
  }
}

/**
 * `useCloudLocationId` for a write that cannot be done without a location
 * (stock, logs, cooking). It throws `NoCloudLocationError` instead of
 * returning `undefined`, so the `'local'` sentinel is never sent.
 */
export function useRequiredCloudLocationId(): (
  explicit?: string,
) => Promise<string> {
  const resolve = useCloudLocationId()
  return useCallback(
    async (explicit?: string) => {
      const id = await resolve(explicit)
      if (id === undefined) throw new NoCloudLocationError()
      return id
    },
    [resolve],
  )
}

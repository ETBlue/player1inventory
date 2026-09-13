import { useApolloClient } from '@apollo/client/react'
import { useCallback } from 'react'
import {
  GetLocationsDocument,
  type GetLocationsQuery,
} from '@/generated/graphql'
import { useActiveLocation } from './useActiveLocation'

// Resolve the location a CLOUD write should target, at CALL time rather than at
// render time.
//
// Why this exists — a real bug, found by cloud E2E on 2026-09-04. On a fresh
// cloud session there is no `active-location-id:cloud` slot, so
// `readStoredLocationId('cloud')` hands back `DEFAULT_LOCATION_ID` — the local
// `'local'` sentinel, which names no cloud `Location`. `ActiveLocationProvider`
// corrects it to the `isDefault` location, but only once `GetLocations` has
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
// Degrades to today's behaviour rather than throwing. If the query yields no
// locations — a stubbed client in a unit test, an offline cache — the caller's
// current active id is returned unchanged, so nothing that worked before starts
// failing here.
export function useCloudLocationId(): (explicit?: string) => Promise<string> {
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
        const fallback = list.find((loc) => loc.isDefault)?.id ?? list[0]?.id
        if (fallback) return fallback
      } catch {
        // Fall through — a failed read must not turn into a failed write with
        // a *different* error than the one the caller would otherwise get.
      }
      return activeLocationId
    },
    [client, activeLocationId],
  )
}

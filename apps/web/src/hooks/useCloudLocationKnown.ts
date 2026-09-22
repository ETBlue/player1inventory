import { useGetLocationsQuery } from '@/generated/graphql'

// Is `activeLocationId` a location this account actually has?
//
// On a fresh cloud session it is not: there is no `active-location-id:cloud`
// slot, so it is still `DEFAULT_LOCATION_ID` — the local `'local'` sentinel —
// until `GetLocations` resolves and `ActiveLocationProvider` corrects it
// (`useCloudLocationId` documents the same window from the write side).
//
// A location-scoped cloud READ must NOT be sent with an unknown id, and not
// merely because the response is a wasted `FORBIDDEN`. Apollo keeps that
// request as a live OBSERVER keyed by its variables, and a mutation that
// refetches BY NAME with `awaitRefetchQueries` refetches the stale
// `{locationId: 'local'}` observer too, fails again, and rejects the
// mutation's own promise. A create then left the item written, the dialog open
// and no navigation: the second half of the bug cloud E2E caught on
// 2026-09-04, and the half that survives fixing the write path alone.
//
// `useGetLocationsQuery` rather than `useLocations()`: this must add nothing to
// the LOCAL branch, and Apollo dedupes it against the provider's own call, so
// the gate costs no request.
//
// It stays on the DEFAULT `cache-first` even though `useLocations()` moved to
// `cache-and-network` (2026-09-21, the stale-list-on-another-device fix). Both
// observers read the same `ROOT_QUERY.locations` cache entry, so the fresh list
// that the provider's network leg writes is broadcast to this gate too — it
// picks up a location added on another device without paying for a second
// request. Pinned by "the `useCloudLocationKnown` gate sees a location the
// refetch discovers" in `useLocations.test.tsx`, which mounts this gate BEFORE
// `useLocations()` so a stuck `cache-first` read would show up.
//
// Callers: `useItems` / `useStockedItems` (`PantryData`), `useItemLogs`
// (`ItemLogs`), `useItemSortData`
// (`LastPurchaseDates`). Every one of those root fields takes a required
// `locationId`.
export function useCloudLocationKnown(
  activeLocationId: string,
  isCloud: boolean,
) {
  const { data } = useGetLocationsQuery({ skip: !isCloud })
  return (
    !isCloud || !!data?.locations.some((loc) => loc.id === activeLocationId)
  )
}

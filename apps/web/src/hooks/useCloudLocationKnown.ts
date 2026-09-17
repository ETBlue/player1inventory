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
// Callers: `useItems` / `useStockedItems` (`PantryData`), `useItemLogs`
// (`ItemLogs`), `useLastPurchaseDate` and `useItemSortData`
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

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  getItemStock,
  getItemStocks,
  getItemStocksByLocation,
} from '@/db/operations'
import { useItemStocksForItemQuery } from '@/generated/graphql'
import { deserializeItemStock } from '@/lib/deserialization'
import { useActiveLocation } from './useActiveLocation'
import { useDataMode } from './useDataMode'

// Per-(item × location) stock hooks — the RAW ItemStock rows, as opposed to the
// joined stock that the pantry/shopping/cooking pages consume through
// `useItems()` / `useItem()`.
//
// Only `useItemStocks` is dual-mode: it backs the Stock tab's all-locations
// pager, which cloud gained in PR 2. `useItemStock` and
// `useItemStocksForLocation` have no cloud caller today and stay Dexie-only;
// the cloud reads they would need are `itemStocksForItem` filtered by location
// and `itemStocks(locationId:)` respectively, both already in the schema.

// The active-location ItemStock for an item (raw row; undefined if not stocked).
// LOCAL ONLY — see above.
export function useItemStock(itemId: string, locationId?: string) {
  const { activeLocationId } = useActiveLocation()
  const loc = locationId ?? activeLocationId
  return useQuery({
    queryKey: ['itemStocks', itemId, { locationId: loc }],
    queryFn: () => getItemStock(itemId, loc),
    enabled: !!itemId,
  })
}

// All ItemStock rows for an item, across every location.
//
// Cloud reads `ItemStocksForItem` — the SAME document and variables `useItem`
// issues for its own per-location row, so Apollo serves both from one request
// rather than the pager costing a second.
export function useItemStocks(itemId: string) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['itemStocks', itemId, 'all'],
    queryFn: () => getItemStocks(itemId),
    enabled: !!itemId && !isCloud,
  })

  // `cache-and-network` — Apollo's default `cache-first` never refreshes the
  // IndexedDB snapshot the cloud cache is restored from. See the comment on
  // `useItems` in `hooks/useItems.ts` and
  // `docs/global/bugs/2026-09-22-bug-cloud-queries-cache-first.md`.
  //
  // This is the SAME document and variables `useItem` reads, and the item
  // detail layout (`routes/items/$id.tsx`) mounts `useItem` on every sub-route,
  // so the pair costs one request — Apollo deduplicates identical in-flight
  // operations.
  const cloud = useItemStocksForItemQuery({
    variables: { itemId },
    skip: !isCloud || !itemId,
    fetchPolicy: 'cache-and-network',
  })

  const cloudData = useMemo(
    () =>
      cloud.data?.itemStocksForItem.map((row) =>
        deserializeItemStock(row as Record<string, unknown>),
      ),
    [cloud.data],
  )

  if (isCloud) {
    return {
      data: cloudData,
      isLoading: cloud.loading,
      // Offline the network leg fails on every mount while the cached data
      // is still good — an error only when there is nothing to show.
      isError: !!cloud.error && !cloud.data,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isError: local.isError,
  }
}

// All ItemStock rows stocked in a location (defaults to the active location).
// LOCAL ONLY — see above.
export function useItemStocksForLocation(locationId?: string) {
  const { activeLocationId } = useActiveLocation()
  const loc = locationId ?? activeLocationId
  return useQuery({
    queryKey: ['itemStocks', 'byLocation', { locationId: loc }],
    queryFn: () => getItemStocksByLocation(loc),
  })
}

import { useQuery } from '@tanstack/react-query'
import {
  getItemStock,
  getItemStocks,
  getItemStocksByLocation,
} from '@/db/operations'
import { useActiveLocation } from './useActiveLocation'

// Per-(item × location) stock hooks. Local-first only — ItemStock has no cloud
// GraphQL backend yet (cloud TODO: GraphQL Location + ItemStock types). The
// joined stock that the pantry/shopping/cooking pages consume comes through
// `useItems()` / `useItem()`; these hooks expose the raw ItemStock rows for
// callers that need a single (item × location) stock or a location's stocks.

// The active-location ItemStock for an item (raw row; undefined if not stocked).
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
export function useItemStocks(itemId: string) {
  return useQuery({
    queryKey: ['itemStocks', itemId, 'all'],
    queryFn: () => getItemStocks(itemId),
    enabled: !!itemId,
  })
}

// All ItemStock rows stocked in a location (defaults to the active location).
export function useItemStocksForLocation(locationId?: string) {
  const { activeLocationId } = useActiveLocation()
  const loc = locationId ?? activeLocationId
  return useQuery({
    queryKey: ['itemStocks', 'byLocation', { locationId: loc }],
    queryFn: () => getItemStocksByLocation(loc),
  })
}

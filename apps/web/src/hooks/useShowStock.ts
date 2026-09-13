import { useCallback } from 'react'
import { isStockedHere } from '@/lib/quantityUtils'

// The `showStock` predicate every location-scoped item list needs for its
// search-tail rows.
//
// A bucket-3 tail row is an item that exists globally but has NO ItemStock in
// the active location, so joinItemStock() hands it zeroed quantities and no
// stockId. Rendering those zeros as if they were real stock is a lie — hence
// the isStockedHere gate.
//
// ONE predicate, no mode branch: since PR 2 the cloud pantry joins `PantryData`
// through the same `joinItemStock`, so a cloud item unstocked here carries
// `stockId: undefined` exactly as a local one does. (It used to short-circuit
// to true in cloud mode, back when cloud had no ItemStock backend and every
// item would otherwise have been blanked.)
//
// Extracted in PR C: the identical expression appeared verbatim at
// PantryListView, ShelfDetailView and shopping/$vendorId, and the two new
// detail views would have made it five.
//
// Call sites import the deep specifier `@/hooks/useShowStock`, matching how
// `useItemSearchTailWiring` is imported in the same files even though
// `hooks/index.ts` re-exports it; this hook is re-exported there for the same
// parity.
export function useShowStock(): (item: { stockId?: string }) => boolean {
  return useCallback((item: { stockId?: string }) => isStockedHere(item), [])
}

import { useCallback } from 'react'
import { isStockedHere } from '@/lib/quantityUtils'
import { useDataMode } from './useDataMode'

// The `showStock` predicate every location-scoped item list needs for its
// search-tail rows.
//
// A bucket-3 tail row is an item that exists globally but has NO ItemStock in
// the active location, so joinItemStock() hands it zeroed quantities and no
// stockId. Rendering those zeros as if they were real stock is a lie — hence
// the isStockedHere gate. Cloud is the one exception: it has no ItemStock
// backend at all, so no cloud item ever carries a stockId and the gate would
// blank out every row; a cloud Item carries its stock inline and always shows
// it. This is NOT a second cloud path — it is the same one-line bypass the
// three call sites already wrote out, now in one place.
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
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  return useCallback(
    (item: { stockId?: string }) => isCloud || isStockedHere(item),
    [isCloud],
  )
}

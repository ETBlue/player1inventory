import { useMemo } from 'react'
import { isStockedHere } from '@/lib/quantityUtils'
import type { PantryItem } from '@/types'
import { useDataMode } from './useDataMode'
import { useItems } from './useItems'

export interface UseItemSearchTailOptions {
  /**
   * The ids the calling page is ALREADY rendering — i.e. its own, already
   * location-scoped list. Not raw group membership: an item that carries the
   * group (this vendor, this shelf, this recipe) but is stocked at another
   * location is deliberately absent from the page's list, so it belongs in the
   * not-stocked-here bucket, where one press stocks it here and promotes it
   * straight into the page's list — correctly skipping the group step, since
   * there is no membership left to grant.
   *
   * Memoize this at the call site; it is a dependency of the derivation below.
   */
  inGroupIds: ReadonlySet<string>
  /** The raw search box value. Blank (or whitespace) yields empty buckets. */
  query: string
}

export interface ItemSearchTailResult {
  /** Bucket 2 — stocked in the active location, absent from the page's list. */
  inLocation: PantryItem[]
  /** Bucket 3 — exists globally, not stocked in the active location. */
  notStockedHere: PantryItem[]
  /**
   * True when ANY global item's name equals the query, wherever it lives —
   * including inside the page's own list. Callers pass this to
   * `ItemListToolbar`'s `hasExactMatch` so the create affordance keys off the
   * GLOBAL catalog rather than the twice-filtered visible set. That is the
   * #245 fix: creating from a search that only *looked* empty minted a second
   * global `Item`, which then followed the user to every location.
   */
  hasExactGlobalMatch: boolean
}

const EMPTY: ItemSearchTailResult = {
  inLocation: [],
  notStockedHere: [],
  hasExactGlobalMatch: false,
}

// The shared tail behind every location-scoped item search. Reads the GLOBAL
// catalog (`useItems()` — every Item joined against active-location stock,
// where `stockId === undefined` means "not stocked here"), subtracts what the
// page already shows, and splits the rest by location.
export function useItemSearchTail({
  inGroupIds,
  query,
}: UseItemSearchTailOptions): ItemSearchTailResult {
  const { data: items = [] } = useItems()
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  return useMemo(() => {
    const lower = query.trim().toLowerCase()
    if (!lower) return EMPTY

    const matches = items.filter((i) => i.name.toLowerCase().includes(lower))
    const hasExactGlobalMatch = items.some(
      (i) => i.name.toLowerCase() === lower,
    )
    const outsideList = matches.filter((i) => !inGroupIds.has(i.id))
    const byName = (a: PantryItem, b: PantryItem) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

    // THE ONE CLOUD BYPASS. Cloud has no Location/ItemStock backend yet, so no
    // cloud item carries a stockId and "stocked here" is meaningless there — a
    // naive split would drop every match into the third section and leave the
    // second empty. Every out-of-list match therefore lands in the in-location
    // bucket and the third section stays off. When cloud gains ItemStock,
    // DELETE THIS BRANCH: the split below is already correct for both modes.
    if (isCloud) {
      return {
        inLocation: outsideList.sort(byName),
        notStockedHere: [],
        hasExactGlobalMatch,
      }
    }

    return {
      inLocation: outsideList.filter(isStockedHere).sort(byName),
      notStockedHere: outsideList.filter((i) => !isStockedHere(i)).sort(byName),
      hasExactGlobalMatch,
    }
  }, [items, inGroupIds, query, isCloud])
}

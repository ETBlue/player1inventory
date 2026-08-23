import { useMemo } from 'react'
import { getTagAndDescendantIds } from '@/lib/tagUtils'
import { useItems, useTags } from './index'

/**
 * Global item count per tag, keyed by tag id — every tag gets an entry,
 * including tags with zero items.
 *
 * Map-shaped and memoized (like `useVendorItemCounts`) because a badge list
 * needs one count per id and hooks cannot be called in a loop; the per-id
 * `useItemCountByTag` is one async query each.
 *
 * **Counts expand descendants.** The shelf tag filter selects a tag *and all
 * its descendants* (`lib/shelfUtils.ts`, via `getTagAndDescendantIds`), so a
 * direct-assignment count would report 0 for a parent tag that in fact selects
 * a dozen items. On a filter-configuration page the count must describe what
 * the filter will actually select, so the same expansion is used here.
 *
 * Location-unaware by design: these are global item↔tag relations.
 */
export function useTagItemCounts(): Map<string, number> {
  const { data: items = [] } = useItems()
  const { data: tags = [] } = useTags()

  return useMemo(() => {
    const counts = new Map<string, number>()

    for (const tag of tags) {
      const matchingIds = new Set(getTagAndDescendantIds(tag.id, tags))
      let count = 0
      for (const item of items) {
        // `some`, not a per-tag increment: an item carrying both a parent and
        // its child must count once for the parent, not twice.
        if ((item.tagIds ?? []).some((tagId) => matchingIds.has(tagId))) {
          count += 1
        }
      }
      counts.set(tag.id, count)
    }

    return counts
  }, [items, tags])
}

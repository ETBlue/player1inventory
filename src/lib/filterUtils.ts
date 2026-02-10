import type { Item } from '@/types'

export interface FilterState {
  [tagTypeId: string]: string[] // tagTypeId -> array of selected tag IDs
}

export function filterItems(items: Item[], filterState: FilterState): Item[] {
  // If no filters active, return all items
  const activeFilters = Object.entries(filterState).filter(
    ([, tagIds]) => tagIds.length > 0,
  )

  if (activeFilters.length === 0) return items

  return items.filter((item) => {
    // For each tag type that has selected tags...
    return activeFilters.every(([_tagTypeId, selectedTagIds]) => {
      // Item must have at least ONE of the selected tags from this type (OR logic)
      return selectedTagIds.some((selectedTagId) =>
        item.tagIds.includes(selectedTagId),
      )
    })
    // All tag types must match (AND logic across types)
  })
}

export function calculateTagCount(
  tagId: string,
  tagTypeId: string,
  items: Item[],
  currentFilters: FilterState,
): number {
  // Simulate selecting this tag with other active filters
  const simulatedFilters = {
    ...currentFilters,
    [tagTypeId]: [...(currentFilters[tagTypeId] || []), tagId],
  }
  return filterItems(items, simulatedFilters).length
}

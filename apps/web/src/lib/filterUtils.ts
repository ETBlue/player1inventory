import { getTagAndDescendantIds } from '@/lib/tagUtils'
import type { Item, Recipe, Tag } from '@/types'
import { isConsumable } from '@/types'

export interface FilterState {
  [tagTypeId: string]: string[] // tagTypeId -> array of selected tag IDs
}

/**
 * Filters items by the given filterState.
 *
 * When `allTags` is provided, each selected tag ID is expanded to include all
 * of its descendants. This means selecting a parent tag also matches items
 * tagged with any of its children (or grandchildren, etc.).
 *
 * Within a single tag type: OR logic (item must match at least one selected tag
 * or its descendants).
 * Across tag types: AND logic (item must match all active tag type filters).
 */
export function filterItems<T extends Item>(
  items: T[],
  filterState: FilterState,
  allTags?: Tag[],
): T[] {
  // If no filters active, return all items
  const activeFilters = Object.entries(filterState).filter(
    ([, tagIds]) => tagIds.length > 0,
  )

  if (activeFilters.length === 0) return items

  return items.filter((item) => {
    // For each tag type that has selected tags...
    return activeFilters.every(([_tagTypeId, selectedTagIds]) => {
      // Expand each selected tag to include all descendants (when allTags provided)
      const expandedIds = allTags
        ? new Set(
            selectedTagIds.flatMap((id) => getTagAndDescendantIds(id, allTags)),
          )
        : new Set(selectedTagIds)
      // Item must have at least ONE tag in the expanded set (OR logic)
      return item.tagIds.some((tagId) => expandedIds.has(tagId))
    })
    // All tag types must match (AND logic across types)
  })
}

/**
 * Calculates how many items would match if the given tag were added to the
 * current filters. Uses descendant expansion when `allTags` is provided.
 */
export function calculateTagCount(
  tagId: string,
  tagTypeId: string,
  items: Item[],
  currentFilters: FilterState,
  allTags?: Tag[],
): number {
  // Simulate selecting this tag with other active filters.
  // Replace (not append) the tag type selection so each tag's count reflects
  // only items matching that specific tag (or its descendants), independent of
  // what else is selected within the same tag type. This prevents subtag count
  // inflation when a parent tag is already selected.
  const simulatedFilters = {
    ...currentFilters,
    [tagTypeId]: [tagId],
  }
  return filterItems(items, simulatedFilters, allTags).length
}

export function filterItemsByVendors<T extends Item>(
  items: T[],
  vendorIds: string[],
): T[] {
  if (vendorIds.length === 0) return items
  return items.filter((item) =>
    vendorIds.some((vid) => item.vendorIds?.includes(vid)),
  )
}

export function filterItemsByRecipes<T extends Item>(
  items: T[],
  recipeIds: string[],
  recipes: Recipe[],
): T[] {
  if (recipeIds.length === 0) return items
  return items.filter((item) =>
    recipeIds.some((rid) => {
      const recipe = recipes.find((r) => r.id === rid)
      return recipe?.items.some((ri) => ri.itemId === item.id) ?? false
    }),
  )
}

// The Consumable filter: All, Consumable or Not consumable. Kept in the URL as
// `f_consumable=yes` or `f_consumable=no` (`useUrlSearchAndFilters`); no
// param means All.
export type ConsumableFilter = 'all' | 'consumable' | 'notConsumable'

/**
 * Keeps the items that match the Consumable filter. `'all'` keeps every item.
 * An item with no stored value counts as consumable (`isConsumable`).
 */
export function filterItemsByConsumable<T extends Item>(
  items: T[],
  filter: ConsumableFilter,
): T[] {
  if (filter === 'all') return items
  const wanted = filter === 'consumable'
  return items.filter((item) => isConsumable(item) === wanted)
}

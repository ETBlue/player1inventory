import { getTagAndDescendantIds } from '@/lib/tagUtils'
import type { FilterConfig, Item, Tag } from '@/types'

/**
 * Returns true if `item` matches the given `filterConfig`.
 *
 * Tag filter:  OR within the same tag type, AND between different tag types.
 *              Selected tags are expanded to include all their descendants.
 * Vendor filter: OR within vendors.
 * Recipe filter: OR within recipes.
 */
export function matchesFilterConfig(
  item: Item,
  filterConfig: FilterConfig,
  recipes: { id: string; items: { itemId: string }[] }[],
  tags: Tag[],
): boolean {
  const { tagIds = [], vendorIds = [], recipeIds = [] } = filterConfig
  // Normalize null to [] — FilterConfig fields may be null in backed-up JSONs;
  // destructuring defaults only apply to undefined, not null.
  const safeTagIds = tagIds ?? []
  const safeVendorIds = vendorIds ?? []
  const safeRecipeIds = recipeIds ?? []

  // Tag filter: OR within same tag type, AND between different tag types.
  // Group selected tag IDs by their type, then require the item to match at
  // least one tag per type (OR within type) for every type that has selections
  // (AND between types).
  if (safeTagIds.length > 0) {
    const tagIdsByType = new Map<string, string[]>()
    for (const tagId of safeTagIds) {
      const tag = tags.find((t) => t.id === tagId)
      if (tag) {
        const existing = tagIdsByType.get(tag.typeId) ?? []
        tagIdsByType.set(tag.typeId, [...existing, tagId])
      }
    }
    for (const typeTagIds of tagIdsByType.values()) {
      // Expand each selected tag to include all its descendants, so selecting a
      // parent tag also matches items that carry a child or grandchild tag.
      const expandedIds = new Set(
        typeTagIds.flatMap((id) => getTagAndDescendantIds(id, tags)),
      )
      if (!item.tagIds.some((tid) => expandedIds.has(tid))) return false
    }
  }

  // Vendor filter: OR within vendors
  if (
    safeVendorIds.length > 0 &&
    !safeVendorIds.some((vid) => (item.vendorIds ?? []).includes(vid))
  ) {
    return false
  }

  // Recipe filter: OR within recipes
  if (safeRecipeIds.length > 0) {
    const inRecipe = safeRecipeIds.some((rid) => {
      const recipe = recipes.find((r) => r.id === rid)
      return recipe?.items.some((ri) => ri.itemId === item.id)
    })
    if (!inRecipe) return false
  }

  return true
}

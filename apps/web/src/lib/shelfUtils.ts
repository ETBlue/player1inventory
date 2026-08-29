import { getTagAndDescendantIds } from '@/lib/tagUtils'
import type { FilterConfig, Item, Tag, TagType } from '@/types'

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

export interface FilterAxisOption {
  id: string
  name: string
}

export interface FilterAxis {
  /** Stable key: the tagTypeId for a tag axis, 'vendor' / 'recipe' for the other two. */
  key: string
  kind: 'tag' | 'vendor' | 'recipe'
  /**
   * Tag axes only — the tag TYPE's name, which is what makes a shelf filtering on two
   * tag types legible ("Category" / "Storage"). The other two kinds carry no name here;
   * the dialog translates their labels, because a pure function must not call `t`.
   */
  typeName?: string
  /** Resolvable options only, in `filterConfig` order. Never contains a dangling id. */
  options: FilterAxisOption[]
  /**
   * Set when the item ALREADY satisfies this axis — the configured id that does it.
   * An axis with `metBy` is rendered read-only and is never written.
   */
  metBy?: string
}

/**
 * Whether ANY item could be made to match this config by adding tags/vendors/recipes.
 *
 * Item-independent on purpose — it is a property of the SHELF, so `ShelfDetailView`
 * decides once per shelf whether the tail's bucket 2 gets an actionable `groupAction`
 * or keeps the inert `groupNote`. `ItemSearchTail`'s `groupAction` is one descriptor for
 * the whole section, so a per-row fallback was never available.
 *
 * An axis is unsatisfiable when every id on it points at a deleted entity. We will not
 * write a dangling vendorId onto an item merely to satisfy `matchesFilterConfig`'s
 * `includes` check, and a deleted recipe has no row to append to.
 *
 * TAG axes are never unsatisfiable: `matchesFilterConfig` resolves each configured tag id
 * through `tags.find` and skips the misses, so an all-dangling tag axis creates no entry
 * in `tagIdsByType` and is not a constraint at all.
 */
export function isFilterConfigSatisfiable(
  filterConfig: FilterConfig,
  vendors: { id: string }[],
  recipes: { id: string }[],
): boolean {
  const vendorIds = filterConfig.vendorIds ?? []
  const recipeIds = filterConfig.recipeIds ?? []

  if (
    vendorIds.length > 0 &&
    !vendorIds.some((id) => vendors.some((v) => v.id === id))
  ) {
    return false
  }
  if (
    recipeIds.length > 0 &&
    !recipeIds.some((id) => recipes.some((r) => r.id === id))
  ) {
    return false
  }
  return true
}

/**
 * Breaks a shelf's `filterConfig` into the axes a press must satisfy for one item.
 *
 * `matchesFilterConfig` ANDs across tags/vendors/recipes and ANDs BETWEEN tag types
 * (OR only WITHIN a type), so one axis per tag type is exactly the granularity at which
 * a user choice is meaningful — and exactly the granularity at which skipping one leaves
 * the item still not matching.
 *
 * Axes carrying `metBy` are already satisfied and MUST NOT be written: adding a second
 * tag of a type the item is already tagged with over-assigns, which is the failure mode
 * the design rejected auto-apply-all for.
 *
 * The met checks mirror `matchesFilterConfig` clause for clause — including descendant
 * expansion on tags — because "every axis met" must mean exactly "the item matches".
 * `shelfUtils.test.ts`'s "agrees with matchesFilterConfig" block pins that equivalence
 * directly, in both directions, across several items (all-met, tag-unmet, vendor-unmet,
 * descendant-met) — not just the all-met case, which an always-`metBy` implementation
 * would also satisfy without actually mirroring anything.
 */
export function deriveFilterAxes(
  item: Item,
  filterConfig: FilterConfig,
  tags: Tag[],
  tagTypes: TagType[],
  vendors: { id: string; name: string }[],
  recipes: { id: string; name: string; items: { itemId: string }[] }[],
): FilterAxis[] {
  const { tagIds = [], vendorIds = [], recipeIds = [] } = filterConfig
  const safeTagIds = tagIds ?? []
  const safeVendorIds = vendorIds ?? []
  const safeRecipeIds = recipeIds ?? []
  const axes: FilterAxis[] = []

  // Tags — one axis per TYPE, in first-appearance order of the configured ids.
  const tagIdsByType = new Map<string, string[]>()
  for (const tagId of safeTagIds) {
    const tag = tags.find((t) => t.id === tagId)
    if (!tag) continue
    tagIdsByType.set(tag.typeId, [
      ...(tagIdsByType.get(tag.typeId) ?? []),
      tagId,
    ])
  }
  for (const [typeId, typeTagIds] of tagIdsByType) {
    const metBy = typeTagIds.find((id) =>
      getTagAndDescendantIds(id, tags).some((expanded) =>
        item.tagIds.includes(expanded),
      ),
    )
    axes.push({
      key: typeId,
      kind: 'tag',
      typeName: tagTypes.find((tt) => tt.id === typeId)?.name ?? '',
      options: typeTagIds.map((id) => ({
        id,
        name: tags.find((t) => t.id === id)?.name ?? '',
      })),
      ...(metBy ? { metBy } : {}),
    })
  }

  if (safeVendorIds.length > 0) {
    // The met check uses EVERY configured id (mirroring matchesFilterConfig), while the
    // options offer only resolvable vendors — we read a dangling id as satisfying, but
    // never write one.
    const metBy = safeVendorIds.find((id) =>
      (item.vendorIds ?? []).includes(id),
    )
    axes.push({
      key: 'vendor',
      kind: 'vendor',
      options: safeVendorIds.flatMap((id) => {
        const vendor = vendors.find((v) => v.id === id)
        return vendor ? [{ id, name: vendor.name }] : []
      }),
      ...(metBy ? { metBy } : {}),
    })
  }

  if (safeRecipeIds.length > 0) {
    const metBy = safeRecipeIds.find((id) =>
      recipes
        .find((r) => r.id === id)
        ?.items.some((ri) => ri.itemId === item.id),
    )
    axes.push({
      key: 'recipe',
      kind: 'recipe',
      options: safeRecipeIds.flatMap((id) => {
        const recipe = recipes.find((r) => r.id === id)
        return recipe ? [{ id, name: recipe.name }] : []
      }),
      ...(metBy ? { metBy } : {}),
    })
  }

  return axes
}

export interface FilterPicks {
  /** One chosen tag id per unmet tag axis. */
  tagIds: string[]
  /** The chosen vendor id, when the vendor axis was unmet. */
  vendorId?: string
  /** The chosen recipe id, when the recipe axis was unmet. */
  recipeId?: string
}

/**
 * The picks that need no user input: every UNMET axis offering exactly one option.
 *
 * The design's rule is "an axis offering exactly one option needs no interaction —
 * pre-select it" — `ShelfFilterPicksDialog` seeds its initial state with this, so a
 * single-option axis renders its radio group already checked and Confirm is enabled
 * immediately. `ShelfDetailView` no longer calls this itself: it used to apply these
 * picks directly and skip the dialog entirely when they covered every unmet axis, but
 * the designer reversed that bypass (2026-08-28) — the dialog is a double-confirm step,
 * not only a disambiguation step, and now always opens. See the dated addendum in
 * docs/features/items/2026-08-26-unified-item-search-design.md's "Filter shelves"
 * section.
 *
 * Met axes are never included: they are already satisfied, and re-writing one would add a
 * second tag of a type the item is already tagged with.
 */
export function defaultPicksFor(axes: FilterAxis[]): FilterPicks {
  const tagIds: string[] = []
  let vendorId: string | undefined
  let recipeId: string | undefined

  for (const axis of axes) {
    if (axis.metBy !== undefined) continue
    if (axis.options.length !== 1) continue
    const onlyOption = axis.options[0]
    if (!onlyOption) continue

    if (axis.kind === 'tag') {
      tagIds.push(onlyOption.id)
    } else if (axis.kind === 'vendor') {
      vendorId = onlyOption.id
    } else if (axis.kind === 'recipe') {
      recipeId = onlyOption.id
    }
  }

  return {
    tagIds,
    ...(vendorId ? { vendorId } : {}),
    ...(recipeId ? { recipeId } : {}),
  }
}

/**
 * How many filter OPTIONS a shelf's `filterConfig` selects — the total number of
 * individual badges toggled on across the Filters tab's three sections
 * (`tagIds` + `vendorIds` + `recipeIds`).
 *
 * Deliberately NOT the number of AXES `deriveFilterAxes` produces: that collapses
 * every tag of one tag type into a single axis, so a shelf selecting two tags of
 * the same type plus a vendor would report 2 where the user toggled 3 badges. The
 * settings shelf row is a tally of the user's own selections, so options is the
 * right unit.
 *
 * Fields are normalised with `?? []` rather than destructuring defaults: a
 * `filterConfig` restored from a backed-up JSON may carry `null` on any of the
 * three arrays, and a destructuring default only covers `undefined`. An absent
 * `filterConfig` counts as 0.
 */
export function countSelectedFilters(
  filterConfig: FilterConfig | undefined,
): number {
  if (!filterConfig) return 0
  const { tagIds, vendorIds, recipeIds } = filterConfig
  return (
    (tagIds ?? []).length + (vendorIds ?? []).length + (recipeIds ?? []).length
  )
}

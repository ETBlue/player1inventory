import { createFileRoute } from '@tanstack/react-router'
import { Fragment, useMemo, useState } from 'react'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemListToolbar } from '@/components/item/ItemListToolbar'
import { useCreateItem, useItems, useTagTypes, useUpdateItem } from '@/hooks'
import { useItemSortData } from '@/hooks/useItemSortData'
import { useRecipes } from '@/hooks/useRecipes'
import { useSortFilter } from '@/hooks/useSortFilter'
import { useTags } from '@/hooks/useTags'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import { useVendors } from '@/hooks/useVendors'
import {
  filterItems,
  filterItemsByRecipes,
  filterItemsByVendors,
} from '@/lib/filterUtils'
import { isInactive } from '@/lib/quantityUtils'
import { sortItems } from '@/lib/sortUtils'
import type { Recipe, Vendor } from '@/types'

export const Route = createFileRoute('/settings/vendors/$id/items')({
  component: VendorItemsTab,
})

function VendorItemsTab() {
  const { id: vendorId } = Route.useParams()
  const { data: items = [] } = useItems()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
  const updateItem = useUpdateItem()
  const createItem = useCreateItem()
  const { data: vendors = [] } = useVendors()
  const { data: recipes = [] } = useRecipes()

  const { sortBy, sortDirection, setSortBy, setSortDirection } =
    useSortFilter('vendor-items')

  const {
    search,
    filterState,
    setFilterState,
    isTagsVisible,
    selectedVendorIds,
    selectedRecipeIds,
    toggleVendorId,
    toggleRecipeId,
  } = useUrlSearchAndFilters()

  const [savingItemIds, setSavingItemIds] = useState<Set<string>>(new Set())

  const tagMap = useMemo(
    () => Object.fromEntries(tags.map((t) => [t.id, t])),
    [tags],
  )

  const vendorMap = useMemo(() => {
    const map = new Map<string, Vendor[]>()
    for (const item of items) {
      map.set(
        item.id,
        vendors.filter((v) => item.vendorIds?.includes(v.id) ?? false),
      )
    }
    return map
  }, [items, vendors])

  const recipeMap = useMemo(() => {
    const map = new Map<string, Recipe[]>()
    for (const recipe of recipes) {
      for (const ri of recipe.items) {
        const existing = map.get(ri.itemId) ?? []
        map.set(ri.itemId, [...existing, recipe])
      }
    }
    return map
  }, [recipes])

  const {
    quantities: allQuantities,
    expiryDates: allExpiryDates,
    purchaseDates: allPurchaseDates,
  } = useItemSortData(items)

  const isAssigned = (vendorIds: string[] = []) => vendorIds.includes(vendorId)

  const handleToggle = async (
    itemId: string,
    currentVendorIds: string[] = [],
  ) => {
    if (savingItemIds.has(itemId)) return
    const dbAssigned = currentVendorIds.includes(vendorId)
    const newVendorIds = dbAssigned
      ? currentVendorIds.filter((id) => id !== vendorId)
      : [...currentVendorIds, vendorId]

    setSavingItemIds((prev) => new Set(prev).add(itemId))
    try {
      await updateItem.mutateAsync({
        id: itemId,
        updates: { vendorIds: newVendorIds },
      })
    } finally {
      setSavingItemIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const activeTagIds = useMemo(
    () => Object.values(filterState).flat(),
    [filterState],
  )

  const handleTagClick = (clickedTagId: string) => {
    const tag = tags.find((t) => t.id === clickedTagId)
    if (!tag) return
    const tagType = tagTypes.find((t) => t.id === tag.typeId)
    if (!tagType) return
    const existingTags = filterState[tagType.id] || []
    if (existingTags.includes(clickedTagId)) {
      const newTags = existingTags.filter((id) => id !== clickedTagId)
      if (newTags.length === 0) {
        const { [tagType.id]: _, ...rest } = filterState
        setFilterState(rest)
      } else {
        setFilterState({ ...filterState, [tagType.id]: newTags })
      }
      return
    }
    setFilterState({
      ...filterState,
      [tagType.id]: [...existingTags, clickedTagId],
    })
  }

  const handleCreateFromSearch = async () => {
    const trimmed = search.trim()
    if (!trimmed) return
    try {
      await createItem.mutateAsync({
        name: trimmed,
        vendorIds: [vendorId],
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 0,
      })
    } catch {
      // input stays populated for retry
    }
  }

  // Branch A: search only
  const searchedItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )
  const hasExactMatch = searchedItems.some(
    (item) => item.name.toLowerCase() === search.trim().toLowerCase(),
  )

  // Branch B: all filters
  const tagFiltered = filterItems(items, filterState)
  const vendorFiltered = filterItemsByVendors(tagFiltered, selectedVendorIds)
  const recipeFiltered = filterItemsByRecipes(
    vendorFiltered,
    selectedRecipeIds,
    recipes,
  )

  // Converge at sort
  const sortedItems = sortItems(
    search.trim() ? searchedItems : recipeFiltered,
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    allPurchaseDates ?? new Map(),
    sortBy,
    sortDirection,
  )
  // Four-bucket ordering: assigned before unassigned, active before inactive within each group
  const assignedItems = [
    ...sortedItems.filter(
      (item) => isAssigned(item.vendorIds) && !isInactive(item),
    ),
    ...sortedItems.filter(
      (item) => isAssigned(item.vendorIds) && isInactive(item),
    ),
  ]
  const unassignedItems = [
    ...sortedItems.filter(
      (item) => !isAssigned(item.vendorIds) && !isInactive(item),
    ),
    ...sortedItems.filter(
      (item) => !isAssigned(item.vendorIds) && isInactive(item),
    ),
  ]
  const filteredItems = [...assignedItems, ...unassignedItems]

  return (
    <div className="max-w-2xl">
      <ItemListToolbar
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSortChange={(field, direction) => {
          setSortBy(field)
          setSortDirection(direction)
        }}
        isTagsToggleEnabled
        items={items}
        vendors={vendors}
        recipes={recipes}
        onCreateFromSearch={handleCreateFromSearch}
        hasExactMatch={hasExactMatch}
        className="bg-transparent border-none"
      />
      <div className="h-px bg-accessory-default" />

      {items.length === 0 && !search.trim() && (
        <p className="text-sm text-foreground-muted py-4">No items yet.</p>
      )}

      {[
        { key: 'assigned', items: assignedItems },
        { key: 'unassigned', items: unassignedItems },
      ].map(({ key, items }) => (
        <Fragment key={key}>
          {key === 'unassigned' &&
            assignedItems.length > 0 &&
            unassignedItems.length > 0 && (
              <div className="h-px bg-accessory-default" />
            )}
          <div className="space-y-px">
            {items.map((item) => {
              const itemTags = (item.tagIds ?? [])
                .map((tid) => tagMap[tid])
                .filter((t): t is NonNullable<typeof t> => t != null)

              return (
                <div
                  key={item.id}
                  className={key === 'assigned' ? 'bg-background-surface' : ''}
                >
                  <ItemCard
                    mode="tag-assignment"
                    item={item}
                    tags={itemTags}
                    tagTypes={tagTypes}
                    showTags={isTagsVisible}
                    showExpiration={false}
                    vendors={vendorMap.get(item.id) ?? []}
                    recipes={recipeMap.get(item.id) ?? []}
                    onTagClick={handleTagClick}
                    onVendorClick={toggleVendorId}
                    onRecipeClick={toggleRecipeId}
                    activeTagIds={activeTagIds}
                    activeVendorIds={selectedVendorIds}
                    activeRecipeIds={selectedRecipeIds}
                    isChecked={isAssigned(item.vendorIds)}
                    onCheckboxToggle={() =>
                      handleToggle(item.id, item.vendorIds)
                    }
                    disabled={savingItemIds.has(item.id)}
                  />
                </div>
              )
            })}
          </div>
        </Fragment>
      ))}
      {filteredItems.length === 0 &&
        (Object.values(filterState).some((ids) => ids.length > 0) ||
          selectedVendorIds.length > 0 ||
          selectedRecipeIds.length > 0) &&
        !search.trim() && (
          <p className="text-sm text-foreground-muted py-4 px-1">
            No items match the current filters.
          </p>
        )}
    </div>
  )
}

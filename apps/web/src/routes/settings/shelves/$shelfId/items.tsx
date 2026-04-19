import { createFileRoute, useRouterState } from '@tanstack/react-router'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemListToolbar } from '@/components/item/ItemListToolbar'
import { EmptyState } from '@/components/shared/EmptyState'
import { useCreateItem, useItems, useTagTypes } from '@/hooks'
import { useItemSortData } from '@/hooks/useItemSortData'
import { useRecipes } from '@/hooks/useRecipes'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useShelfQuery, useUpdateShelfMutation } from '@/hooks/useShelves'
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

export const Route = createFileRoute('/settings/shelves/$shelfId/items')({
  component: ShelfItemsTab,
})

function ShelfItemsTab() {
  const { t } = useTranslation()
  const { shelfId } = Route.useParams()
  const { data: shelf } = useShelfQuery(shelfId)
  const updateShelf = useUpdateShelfMutation()
  const createItem = useCreateItem()
  const { data: items = [], isLoading } = useItems()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
  const { data: vendors = [] } = useVendors()
  const { data: recipes = [] } = useRecipes()

  const { sortBy, sortDirection, setSortBy, setSortDirection } =
    useSortFilter('shelf-items')

  const {
    search,
    filterState,
    setFilterState,
    selectedVendorIds,
    selectedRecipeIds,
    toggleVendorId,
    toggleRecipeId,
  } = useUrlSearchAndFilters()

  // Scroll restoration: save on unmount, restore after data loads
  const currentUrl = useRouterState({
    select: (s) => s.location.pathname + (s.location.searchStr ?? ''),
  })
  const { restoreScroll } = useScrollRestoration(currentUrl)
  useEffect(() => {
    if (!isLoading) restoreScroll()
  }, [isLoading, restoreScroll])

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

  const isAssigned = (itemId: string) =>
    shelf?.itemIds?.includes(itemId) ?? false

  const handleToggle = async (itemId: string) => {
    if (!shelf) return
    if (savingItemIds.has(itemId)) return
    const currentIds = shelf.itemIds ?? []
    const newIds = currentIds.includes(itemId)
      ? currentIds.filter((id) => id !== itemId)
      : [...currentIds, itemId]

    setSavingItemIds((prev) => new Set(prev).add(itemId))
    try {
      await updateShelf.mutateAsync({ id: shelf.id, data: { itemIds: newIds } })
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
    if (!shelf) return
    const trimmed = search.trim()
    if (!trimmed) return
    try {
      const newItem = await createItem.mutateAsync({
        name: trimmed,
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 0,
      })
      if (!newItem) return
      const currentIds = shelf.itemIds ?? []
      await updateShelf.mutateAsync({
        id: shelf.id,
        data: { itemIds: [...currentIds, newItem.id] },
      })
    } catch {
      // input stays populated for retry
    }
  }

  // Not applicable for non-selection shelves
  if (shelf && shelf.type !== 'selection') {
    return (
      <EmptyState
        title="Not applicable"
        description="Filter shelves include items automatically."
      />
    )
  }

  // Branch A: search only
  const searchedItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )
  const hasExactMatch = searchedItems.some(
    (item) => item.name.toLowerCase() === search.trim().toLowerCase(),
  )

  // Branch B: all filters
  const tagFiltered = filterItems(items, filterState, tags)
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
    ...sortedItems.filter((item) => isAssigned(item.id) && !isInactive(item)),
    ...sortedItems.filter((item) => isAssigned(item.id) && isInactive(item)),
  ]
  const unassignedItems = [
    ...sortedItems.filter((item) => !isAssigned(item.id) && !isInactive(item)),
    ...sortedItems.filter((item) => !isAssigned(item.id) && isInactive(item)),
  ]
  const filteredItems = [...assignedItems, ...unassignedItems]

  return (
    <div className="max-w-2xl mx-auto">
      <ItemListToolbar
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSortChange={(field, direction) => {
          setSortBy(field)
          setSortDirection(direction)
        }}
        items={items}
        vendors={vendors}
        recipes={recipes}
        onCreateFromSearch={handleCreateFromSearch}
        hasExactMatch={hasExactMatch}
        className="bg-transparent border-none"
      />
      <div className="h-px bg-accessory-default" />

      {items.length === 0 && !search.trim() && (
        <EmptyState
          title={t('settings.shelves.items.empty.title', 'No items yet')}
          description={t(
            'settings.shelves.items.empty.description',
            'Add items to get started.',
          )}
        />
      )}

      {[
        { key: 'assigned', items: assignedItems },
        { key: 'unassigned', items: unassignedItems },
      ].map(({ key, items: bucketItems }) => (
        <Fragment key={key}>
          {key === 'unassigned' &&
            assignedItems.length > 0 &&
            unassignedItems.length > 0 && (
              <div className="h-px bg-accessory-default" />
            )}
          <div className="space-y-px">
            {bucketItems.map((item) => {
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
                    showTags={false}
                    showTagSummary={false}
                    showExpiration={false}
                    vendors={vendorMap.get(item.id) ?? []}
                    recipes={recipeMap.get(item.id) ?? []}
                    onTagClick={handleTagClick}
                    onVendorClick={toggleVendorId}
                    onRecipeClick={toggleRecipeId}
                    activeTagIds={activeTagIds}
                    activeVendorIds={selectedVendorIds}
                    activeRecipeIds={selectedRecipeIds}
                    isChecked={isAssigned(item.id)}
                    onCheckboxToggle={() => handleToggle(item.id)}
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

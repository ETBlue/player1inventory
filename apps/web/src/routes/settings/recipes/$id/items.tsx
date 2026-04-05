import { createFileRoute, useRouterState } from '@tanstack/react-router'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemListToolbar } from '@/components/item/ItemListToolbar'
import { EmptyState } from '@/components/shared/EmptyState'
import { useCreateItem, useItems, useTags, useTagTypes } from '@/hooks'
import { useItemSortData } from '@/hooks/useItemSortData'
import { useRecipe, useRecipes, useUpdateRecipe } from '@/hooks/useRecipes'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useSortFilter } from '@/hooks/useSortFilter'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import { useVendors } from '@/hooks/useVendors'
import {
  filterItems,
  filterItemsByRecipes,
  filterItemsByVendors,
} from '@/lib/filterUtils'
import { isInactive, roundToStep } from '@/lib/quantityUtils'
import { sortItems } from '@/lib/sortUtils'
import type { Recipe, Vendor } from '@/types'

export const Route = createFileRoute('/settings/recipes/$id/items')({
  component: RecipeItemsTab,
})

function RecipeItemsTab() {
  const { t } = useTranslation()
  const { id: recipeId } = Route.useParams()
  const { data: items = [], isLoading } = useItems()
  const { data: recipe } = useRecipe(recipeId)
  const updateRecipe = useUpdateRecipe()
  const createItem = useCreateItem()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
  const { data: vendors = [] } = useVendors()
  const { data: allRecipes = [] } = useRecipes()

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
    for (const r of allRecipes) {
      for (const ri of r.items) {
        const existing = map.get(ri.itemId) ?? []
        map.set(ri.itemId, [...existing, r])
      }
    }
    return map
  }, [allRecipes])

  const [savingItemIds, setSavingItemIds] = useState<Set<string>>(new Set())

  const recipeItems = recipe?.items ?? []

  const isAssigned = (itemId: string) =>
    recipeItems.some((ri) => ri.itemId === itemId)

  const getDefaultAmount = (itemId: string): number => {
    const ri = recipeItems.find((ri) => ri.itemId === itemId)
    return ri?.defaultAmount ?? 0
  }

  const { sortBy, sortDirection, setSortBy, setSortDirection } =
    useSortFilter('recipe-items')

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

  const {
    quantities: allQuantities,
    expiryDates: allExpiryDates,
    purchaseDates: allPurchaseDates,
  } = useItemSortData(items)

  // Branch A: search only
  const searchedItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )
  const hasExactMatch = searchedItems.some(
    (item) => item.name.toLowerCase() === search.trim().toLowerCase(),
  )

  // Branch B: all filters
  // Pass tags to enable descendant expansion (selecting a parent tag matches its children too)
  const tagFiltered = filterItems(items, filterState, tags)
  const vendorFiltered = filterItemsByVendors(tagFiltered, selectedVendorIds)
  const recipeFiltered = filterItemsByRecipes(
    vendorFiltered,
    selectedRecipeIds,
    allRecipes,
  )

  const displayItems = search.trim() ? searchedItems : recipeFiltered // trim guards whitespace-only input

  // Assigned-first sort
  const assignedItems = displayItems.filter((item) => isAssigned(item.id))
  const unassignedItems = displayItems.filter((item) => !isAssigned(item.id))

  const sortedAssigned = sortItems(
    assignedItems,
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    allPurchaseDates ?? new Map(),
    sortBy,
    sortDirection,
  )
  const sortedUnassigned = sortItems(
    unassignedItems,
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    allPurchaseDates ?? new Map(),
    sortBy,
    sortDirection,
  )

  // Four-bucket ordering: assigned before unassigned, active before inactive within each group
  const sortedAssignedBucket = [
    ...sortedAssigned.filter((item) => !isInactive(item)),
    ...sortedAssigned.filter((item) => isInactive(item)),
  ]
  const sortedUnassignedBucket = [
    ...sortedUnassigned.filter((item) => !isInactive(item)),
    ...sortedUnassigned.filter((item) => isInactive(item)),
  ]
  const filteredItems = [...sortedAssignedBucket, ...sortedUnassignedBucket]

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
      const newItem = await createItem.mutateAsync({
        name: trimmed,
        vendorIds: [],
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 0,
      })
      // Immediately add the new item to the recipe
      if (!newItem) return
      const newRecipeItems = [
        ...recipeItems,
        { itemId: newItem.id, defaultAmount: newItem.consumeAmount },
      ]
      await updateRecipe.mutateAsync({
        id: recipeId,
        updates: { items: newRecipeItems },
      })
    } catch {
      // input stays populated for retry
    }
  }

  const handleToggle = async (itemId: string, consumeAmount: number) => {
    if (savingItemIds.has(itemId)) return // guard against re-entrancy
    const assigned = isAssigned(itemId)

    const newRecipeItems = assigned
      ? recipeItems.filter((ri) => ri.itemId !== itemId)
      : [...recipeItems, { itemId, defaultAmount: consumeAmount || 1 }]

    setSavingItemIds((prev) => new Set(prev).add(itemId))
    try {
      await updateRecipe.mutateAsync({
        id: recipeId,
        updates: { items: newRecipeItems },
      })
    } finally {
      setSavingItemIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const handleDefaultAmountChange = async (
    itemId: string,
    newAmount: number,
  ) => {
    if (savingItemIds.has(itemId)) return
    const newRecipeItems = recipeItems.map((ri) =>
      ri.itemId === itemId ? { ...ri, defaultAmount: newAmount } : ri,
    )

    setSavingItemIds((prev) => new Set(prev).add(itemId))
    try {
      await updateRecipe.mutateAsync({
        id: recipeId,
        updates: { items: newRecipeItems },
      })
    } finally {
      setSavingItemIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const handleAdjustDefaultAmount = async (itemId: string, delta: number) => {
    const item = items.find((i) => i.id === itemId)
    const step = (item?.consumeAmount ?? 0) > 0 ? (item?.consumeAmount ?? 1) : 1
    const current = getDefaultAmount(itemId)
    const next = roundToStep(Math.max(0, current + delta * step), step)
    await handleDefaultAmountChange(itemId, next)
  }

  return (
    <div className="space-y-0 max-w-2xl mx-auto">
      <ItemListToolbar
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSortChange={(field, direction) => {
          setSortBy(field)
          setSortDirection(direction)
        }}
        items={items}
        vendors={vendors}
        recipes={allRecipes}
        onCreateFromSearch={handleCreateFromSearch}
        hasExactMatch={hasExactMatch}
        className="bg-transparent border-none"
      />
      <div className="h-px bg-accessory-default" />

      {items.length === 0 && !search.trim() && (
        <EmptyState
          title={t('settings.recipes.items.empty.title')}
          description={t('settings.recipes.items.empty.description')}
        />
      )}

      {[
        { key: 'assigned', items: sortedAssignedBucket },
        { key: 'unassigned', items: sortedUnassignedBucket },
      ].map(({ key, items }) => (
        <Fragment key={key}>
          {key === 'unassigned' &&
            sortedAssignedBucket.length > 0 &&
            sortedUnassignedBucket.length > 0 && (
              <div className="h-px bg-accessory-default" />
            )}
          <div className="space-y-px">
            {items.map((item) => {
              const assigned = isAssigned(item.id)
              const itemTags = (item.tagIds ?? [])
                .map((tid) => tagMap[tid])
                .filter((t): t is NonNullable<typeof t> => t != null)

              return (
                <div
                  key={item.id}
                  className={key === 'assigned' ? 'bg-background-surface' : ''}
                >
                  <ItemCard
                    mode="recipe-assignment"
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
                    isChecked={assigned}
                    onCheckboxToggle={() =>
                      handleToggle(item.id, item.consumeAmount ?? 1)
                    }
                    {...(assigned
                      ? { controlAmount: getDefaultAmount(item.id) }
                      : {})}
                    minControlAmount={0}
                    onAmountChange={(delta) =>
                      handleAdjustDefaultAmount(item.id, delta)
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

import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { ItemCard } from '@/components/ItemCard'
import { ItemListToolbar } from '@/components/ItemListToolbar'
import { getLastPurchaseDate } from '@/db/operations'
import { useCreateItem, useItems, useTagTypes, useUpdateItem } from '@/hooks'
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
import { getCurrentQuantity } from '@/lib/quantityUtils'
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

  const { data: allQuantities } = useQuery({
    queryKey: ['items', 'quantities'],
    queryFn: async () => {
      const map = new Map<string, number>()
      for (const item of items) {
        map.set(item.id, getCurrentQuantity(item))
      }
      return map
    },
    enabled: items.length > 0,
  })

  const { data: allExpiryDates } = useQuery({
    queryKey: ['items', 'expiryDates'],
    queryFn: async () => {
      const map = new Map<string, Date | undefined>()
      for (const item of items) {
        const lastPurchase = await getLastPurchaseDate(item.id)
        const estimatedDate =
          item.estimatedDueDays && lastPurchase
            ? new Date(
                lastPurchase.getTime() +
                  item.estimatedDueDays * 24 * 60 * 60 * 1000,
              )
            : item.dueDate
        map.set(item.id, estimatedDate)
      }
      return map
    },
    enabled: items.length > 0,
  })

  const { data: allPurchaseDates } = useQuery({
    queryKey: ['items', 'purchaseDates'],
    queryFn: async () => {
      const map = new Map<string, Date | null>()
      for (const item of items) {
        map.set(item.id, await getLastPurchaseDate(item.id))
      }
      return map
    },
    enabled: items.length > 0,
  })

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

  const handleVendorClick = (vendorId: string) => toggleVendorId(vendorId)
  const handleRecipeClick = (recipeId: string) => toggleRecipeId(recipeId)

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

  // 1. Name search filter
  const searchFiltered = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )

  // 2. Tag filter (disabled during search)
  const tagFiltered = search
    ? searchFiltered
    : filterItems(searchFiltered, filterState)

  // 3. Vendor and recipe filters
  const vendorFiltered = filterItemsByVendors(tagFiltered, selectedVendorIds)
  const recipeFiltered = filterItemsByRecipes(
    vendorFiltered,
    selectedRecipeIds,
    recipes,
  )

  // 4. Sort
  const filteredItems = sortItems(
    recipeFiltered,
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    allPurchaseDates ?? new Map(),
    sortBy,
    sortDirection,
  )

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
        hideVendorFilter
        onCreateFromSearch={handleCreateFromSearch}
        className="bg-transparent border-none"
      />
      <div className="h-px bg-accessory-default" />

      {items.length === 0 && !search.trim() && (
        <p className="text-sm text-foreground-muted py-4">No items yet.</p>
      )}

      <div className="space-y-px">
        {filteredItems.map((item) => {
          const itemTags = (item.tagIds ?? [])
            .map((tid) => tagMap[tid])
            .filter((t): t is NonNullable<typeof t> => t != null)

          return (
            <ItemCard
              key={item.id}
              mode="tag-assignment"
              item={item}
              tags={itemTags}
              tagTypes={tagTypes}
              showTags={isTagsVisible}
              vendors={vendorMap.get(item.id) ?? []}
              recipes={recipeMap.get(item.id) ?? []}
              onVendorClick={handleVendorClick}
              onRecipeClick={handleRecipeClick}
              isChecked={isAssigned(item.vendorIds)}
              onCheckboxToggle={() => handleToggle(item.id, item.vendorIds)}
              disabled={savingItemIds.has(item.id)}
            />
          )
        })}
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
    </div>
  )
}

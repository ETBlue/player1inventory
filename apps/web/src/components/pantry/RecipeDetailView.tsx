import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Settings } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemListToolbar } from '@/components/item/ItemListToolbar'
import { QuickUpdateDialog } from '@/components/item/QuickUpdateDialog'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { LocationSwitcher } from '@/components/shared/LocationSwitcher'
import { Button } from '@/components/ui/button'
import { useStockedItems, useUpdateItem } from '@/hooks'
import { useItemSortData } from '@/hooks/useItemSortData'
import { useRecipes } from '@/hooks/useRecipes'
import { useSortFilter } from '@/hooks/useSortFilter'
import { useTags, useTagTypes } from '@/hooks/useTags'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import { useVendors } from '@/hooks/useVendors'
import { isInactive } from '@/lib/quantityUtils'
import { type SortDirection, type SortField, sortItems } from '@/lib/sortUtils'
import type { PantryItem } from '@/types'

interface RecipeDetailViewProps {
  recipeId: string
}

export function RecipeDetailView({ recipeId }: RecipeDetailViewProps) {
  const navigate = useNavigate()
  const isUnsorted = recipeId === 'unsorted'

  const { data: allItems = [], isLoading: isItemsLoading } = useStockedItems()
  const { data: recipes = [], isLoading: isRecipesLoading } = useRecipes()
  const { data: vendors = [] } = useVendors()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()

  const updateItem = useUpdateItem()

  const {
    sortBy: localSortBy,
    sortDirection: localSortDirection,
    setSortBy,
    setSortDirection,
  } = useSortFilter('recipe-detail', { defaultSortBy: 'name' })

  const sortBy: SortField = localSortBy
  const sortDirection: SortDirection = localSortDirection

  const { search, isTagsVisible } = useUrlSearchAndFilters()

  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set())
  const [quickUpdateItemId, setQuickUpdateItemId] = useState<string | null>(
    null,
  )
  const quickUpdateItem =
    allItems.find((i) => i.id === quickUpdateItemId) ?? null

  const recipe = recipes.find((r) => r.id === recipeId)

  const { quantities, expiryDates, purchaseDates } = useItemSortData(allItems)

  const inScopeItems = useMemo((): PantryItem[] => {
    if (isUnsorted) {
      const allIds = new Set(
        recipes.flatMap((r) => r.items.map((ri) => ri.itemId)),
      )
      return allItems.filter((i) => !allIds.has(i.id))
    }
    if (!recipe) return []
    const ids = new Set(recipe.items.map((ri) => ri.itemId))
    return allItems.filter((i) => ids.has(i.id))
  }, [isUnsorted, allItems, recipes, recipe])

  const sortedItems = useMemo((): PantryItem[] => {
    return sortItems(
      inScopeItems,
      quantities ?? new Map(),
      expiryDates ?? new Map(),
      purchaseDates ?? new Map(),
      sortBy,
      sortDirection,
    )
  }, [
    inScopeItems,
    quantities,
    expiryDates,
    purchaseDates,
    sortBy,
    sortDirection,
  ])

  const trimmedSearch = search.trim()

  const displayedItems = useMemo(() => {
    if (!trimmedSearch) return sortedItems
    return sortedItems.filter((item) =>
      item.name.toLowerCase().includes(trimmedSearch.toLowerCase()),
    )
  }, [sortedItems, trimmedSearch])

  const handleSortChange = (field: SortField, dir: SortDirection) => {
    setSortBy(field)
    setSortDirection(dir)
  }

  const isLoading = isItemsLoading || isRecipesLoading

  if (isLoading) {
    return <LoadingSpinner />
  }

  const title = isUnsorted ? 'Not added to recipe' : (recipe?.name ?? 'Recipe')

  const vendorMap = new Map(
    allItems.map((item) => [
      item.id,
      vendors.filter((v) => item.vendorIds?.includes(v.id) ?? false),
    ]),
  )

  const recipeMap = new Map<string, typeof recipes>()
  for (const r of recipes) {
    for (const ri of r.items) {
      const existing = recipeMap.get(ri.itemId) ?? []
      recipeMap.set(ri.itemId, [...existing, r])
    }
  }

  const renderItemCard = (item: PantryItem) => (
    <ItemCard
      key={item.id}
      item={item}
      tags={tags.filter((t) => item.tagIds.includes(t.id))}
      tagTypes={tagTypes}
      vendors={vendorMap.get(item.id) ?? []}
      recipes={recipeMap.get(item.id) ?? []}
      showTags={isTagsVisible}
      disabled={pendingItemIds.has(item.id)}
      isPending={pendingItemIds.has(item.id)}
      onQuickUpdate={() => setQuickUpdateItemId(item.id)}
    />
  )

  const activeDisplayed = displayedItems.filter((item) => !isInactive(item))
  const inactiveDisplayed = displayedItems.filter((item) => isInactive(item))

  return (
    <div className="h-screen grid grid-rows-[auto_1fr]">
      <div>
        <ItemListToolbar
          className="border-b-1"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSortChange={handleSortChange}
          isRelationsToggleEnabled={true}
          hideFiltersToggle={true}
          items={inScopeItems}
          leading={
            <>
              <Button
                variant="neutral-ghost"
                size="icon"
                className="lg:w-auto lg:mr-3 flex-shrink-0"
                onClick={() =>
                  navigate({ to: '/', search: { groupBy: 'recipe' } })
                }
                aria-label="Go back"
              >
                <ArrowLeft />
                <span className="hidden lg:inline">Go back</span>
              </Button>
              <LocationSwitcher />
              <h1 className="text-base font-regular truncate capitalize">
                {title}
              </h1>
            </>
          }
        >
          {!isUnsorted && (
            <Link
              to="/settings/recipes/$id"
              params={{ id: recipeId }}
              aria-label="Recipe settings"
            >
              <Button
                variant="neutral-ghost"
                size="icon"
                tabIndex={-1}
                aria-hidden={true}
              >
                <Settings />
              </Button>
            </Link>
          )}
        </ItemListToolbar>
      </div>

      <div className="overflow-y-auto">
        <div className="h-px bg-accessory-default" />
        <div className="flex flex-col gap-px">
          {activeDisplayed.map(renderItemCard)}
          {inactiveDisplayed.length > 0 && (
            <div className="bg-background-surface px-3 py-2 text-foreground-muted text-center text-sm">
              {inactiveDisplayed.length} inactive item
              {inactiveDisplayed.length !== 1 ? 's' : ''}
            </div>
          )}
          {inactiveDisplayed.map(renderItemCard)}
          {sortedItems.length === 0 && (
            <div className="text-center py-12 text-foreground-muted">
              <p className="font-medium">No items</p>
              <p className="text-sm mt-1">
                {isUnsorted
                  ? 'All items are assigned to recipes'
                  : 'No items are assigned to this recipe'}
              </p>
            </div>
          )}
        </div>
      </div>
      {quickUpdateItem && (
        <QuickUpdateDialog
          item={quickUpdateItem}
          isOpen={true}
          onClose={() => setQuickUpdateItemId(null)}
          onSubmit={async ({ packedQuantity, unpackedQuantity }) => {
            setPendingItemIds((prev) => new Set(prev).add(quickUpdateItem.id))
            try {
              await updateItem.mutateAsync({
                id: quickUpdateItem.id,
                updates: { packedQuantity, unpackedQuantity },
              })
              setQuickUpdateItemId(null)
            } finally {
              setPendingItemIds((prev) => {
                const next = new Set(prev)
                next.delete(quickUpdateItem.id)
                return next
              })
            }
          }}
        />
      )}
    </div>
  )
}

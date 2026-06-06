import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemListToolbar } from '@/components/item/ItemListToolbar'
import { NewItemDialog } from '@/components/item/NewItemDialog'
import { QuickUpdateDialog } from '@/components/item/QuickUpdateDialog'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ViewToggle } from '@/components/shared/ViewToggle'
import { Button } from '@/components/ui/button'
import { useItems, useUpdateItem } from '@/hooks'
import { useItemSortData } from '@/hooks/useItemSortData'
import { useRecipes } from '@/hooks/useRecipes'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useSortFilter } from '@/hooks/useSortFilter'
import { useTags, useTagTypes } from '@/hooks/useTags'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import { useVendors } from '@/hooks/useVendors'
import {
  filterItems,
  filterItemsByRecipes,
  filterItemsByVendors,
} from '@/lib/filterUtils'
import { isInactive } from '@/lib/quantityUtils'
import { sortItems } from '@/lib/sortUtils'
import { getStoredPantryView, setPantryView } from '@/lib/viewPreference'
import type { Recipe, Vendor } from '@/types'

export const Route = createFileRoute('/')({
  component: PantryView,
})

function PantryView() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Redirect to /shelves only if the user has explicitly stored a 'group' preference
  useEffect(() => {
    if (getStoredPantryView() === 'group') {
      navigate({ to: '/shelves' })
    }
  }, [navigate])
  const { data: items = [], isLoading } = useItems()
  const { data: tags = [], isLoading: isTagsLoading } = useTags()
  const { data: tagTypes = [], isLoading: isTagTypesLoading } = useTagTypes()
  const { data: vendors = [], isLoading: isVendorsLoading } = useVendors()
  const { data: recipes = [], isLoading: isRecipesLoading } = useRecipes()
  const updateItem = useUpdateItem()
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set())
  const [quickUpdateItemId, setQuickUpdateItemId] = useState<string | null>(
    null,
  )
  const quickUpdateItem = items.find((i) => i.id === quickUpdateItemId) ?? null
  const [newItemOpen, setNewItemOpen] = useState(false)
  const [newItemInitialName, setNewItemInitialName] = useState('')

  const handleCreateFromSearch = (query: string) => {
    setNewItemInitialName(query)
    setNewItemOpen(true)
  }

  // Sort prefs from localStorage (pantry defaults to 'expiring')
  const { sortBy, sortDirection, setSortBy, setSortDirection } = useSortFilter(
    'pantry',
    { defaultSortBy: 'expiring' },
  )

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

  // Scroll restoration: save on unmount, restore after ALL layout-affecting data loads.
  // The filter panel height depends on tagTypes/vendors/recipes; item card heights depend
  // on tags (when isTagsVisible). Restoring scroll before these load causes layout shifts
  // that land the page at the wrong position when the filter panel is open.
  const allDataLoaded =
    !isLoading &&
    !isTagsLoading &&
    !isTagTypesLoading &&
    !isVendorsLoading &&
    !isRecipesLoading
  const currentUrl = useRouterState({
    select: (s) => s.location.pathname + (s.location.searchStr ?? ''),
  })
  const { restoreScroll } = useScrollRestoration(currentUrl)
  useEffect(() => {
    if (allDataLoaded) restoreScroll()
  }, [allDataLoaded, restoreScroll])

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

  // Branch A: search only (no filters)
  const searchedItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )
  const hasExactMatch = searchedItems.some(
    (item) => item.name.toLowerCase() === search.trim().toLowerCase(),
  )

  // Branch B: all filters, no search
  // Pass tags to enable descendant expansion (selecting a parent tag matches its children too)
  const tagFiltered = filterItems(items, filterState, tags)
  const vendorFiltered = filterItemsByVendors(tagFiltered, selectedVendorIds)
  const filteredItems = filterItemsByRecipes(
    vendorFiltered,
    selectedRecipeIds,
    recipes,
  )

  const {
    quantities: allQuantities,
    expiryDates: allExpiryDates,
    purchaseDates: allPurchaseDates,
  } = useItemSortData(items)

  // Apply sorting
  const sortedItems = sortItems(
    search.trim() ? searchedItems : filteredItems, // trim guards whitespace-only input
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    allPurchaseDates ?? new Map(),
    sortBy,
    sortDirection,
  )

  // Separate active and inactive items
  const activeItems = sortedItems.filter((item) => !isInactive(item))
  const inactiveItems = sortedItems.filter((item) => isInactive(item))

  const activeTagIds = useMemo(
    () => Object.values(filterState).flat(),
    [filterState],
  )

  // Handle tag click - toggle tag in filter
  const handleTagClick = (tagId: string) => {
    const tag = tags.find((t) => t.id === tagId)
    if (!tag) return

    const tagType = tagTypes.find((t) => t.id === tag.typeId)
    if (!tagType) return

    const existingTags = filterState[tagType.id] || []

    // If tag is already in filter, remove it (toggle off)
    if (existingTags.includes(tagId)) {
      const newTags = existingTags.filter((id) => id !== tagId)
      if (newTags.length === 0) {
        const { [tagType.id]: _, ...rest } = filterState
        setFilterState(rest)
      } else {
        setFilterState({
          ...filterState,
          [tagType.id]: newTags,
        })
      }
      return
    }

    // Otherwise add it (toggle on)
    setFilterState({
      ...filterState,
      [tagType.id]: [...existingTags, tagId],
    })
  }

  const handleVendorClick = (vendorId: string) => {
    toggleVendorId(vendorId)
  }

  const handleRecipeClick = (recipeId: string) => {
    toggleRecipeId(recipeId)
  }

  if (isLoading) {
    return <LoadingSpinner />
  }

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <div>
        <ItemListToolbar
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSortChange={(field, direction) => {
            setSortBy(field)
            setSortDirection(direction)
          }}
          isTagsToggleEnabled
          items={items}
          className="border-b"
          onCreateFromSearch={handleCreateFromSearch}
          hasExactMatch={hasExactMatch}
          vendors={vendors}
          recipes={recipes}
          leading={
            <ViewToggle
              current="list"
              onChange={(view) => {
                if (view === 'group') {
                  setPantryView('group')
                  navigate({ to: '/shelves' })
                }
              }}
            />
          }
        >
          <Button
            size="icon"
            className="lg:w-auto lg:px-3"
            aria-label="Add item"
            onClick={() => setNewItemOpen(true)}
          >
            <Plus />
            <span className="hidden lg:inline">Add</span>
          </Button>
        </ItemListToolbar>
        <div className="h-px bg-accessory-default" />
      </div>
      <div className="overflow-y-auto [container-type:size]">
        {items.length === 0 ? (
          <div className="text-center py-16 text-foreground-muted flex flex-col items-center gap-6">
            <div>
              <p>{t('pantry.empty.title')}</p>
              <p className="text-sm mt-1">{t('pantry.empty.description')}</p>
            </div>
            <Button
              size="lg"
              className="px-8"
              onClick={() => setNewItemOpen(true)}
            >
              <Plus />
              {t('pantry.empty.createButton')}
            </Button>
          </div>
        ) : sortedItems.length === 0 ? (
          <div className="text-center py-12 text-foreground-muted">
            <p>No items match the current filters.</p>
            <p className="text-sm mt-1">
              Try adjusting or clearing your filters.
            </p>
          </div>
        ) : (
          <div className="bg-background-base flex flex-col gap-px mb-4">
            {activeItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                tags={tags.filter((t) => item.tagIds.includes(t.id))}
                tagTypes={tagTypes}
                showTags={isTagsVisible}
                vendors={vendorMap.get(item.id) ?? []}
                recipes={recipeMap.get(item.id) ?? []}
                activeVendorIds={selectedVendorIds}
                activeRecipeIds={selectedRecipeIds}
                activeTagIds={activeTagIds}
                isPending={pendingItemIds.has(item.id)}
                onQuickUpdate={() => setQuickUpdateItemId(item.id)}
                onTagClick={handleTagClick}
                onVendorClick={handleVendorClick}
                onRecipeClick={handleRecipeClick}
              />
            ))}

            {inactiveItems.length > 0 && (
              <div className="bg-background-surface px-3 py-2 text-foreground-muted text-center text-sm">
                {inactiveItems.length} inactive item
                {inactiveItems.length !== 1 ? 's' : ''}
              </div>
            )}

            {inactiveItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                tags={tags.filter((t) => item.tagIds.includes(t.id))}
                tagTypes={tagTypes}
                showTags={isTagsVisible}
                vendors={vendorMap.get(item.id) ?? []}
                recipes={recipeMap.get(item.id) ?? []}
                activeVendorIds={selectedVendorIds}
                activeRecipeIds={selectedRecipeIds}
                activeTagIds={activeTagIds}
                isPending={pendingItemIds.has(item.id)}
                onQuickUpdate={() => setQuickUpdateItemId(item.id)}
                onTagClick={handleTagClick}
                onVendorClick={handleVendorClick}
                onRecipeClick={handleRecipeClick}
              />
            ))}
          </div>
        )}
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
      <NewItemDialog
        open={newItemOpen}
        onOpenChange={setNewItemOpen}
        initialName={newItemInitialName}
      />
    </div>
  )
}

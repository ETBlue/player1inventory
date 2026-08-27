import { useNavigate, useRouterState } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemListToolbar } from '@/components/item/ItemListToolbar'
import { ItemSearchTail } from '@/components/item/ItemSearchTail'
import { NewItemDialog } from '@/components/item/NewItemDialog'
import { QuickUpdateDialog } from '@/components/item/QuickUpdateDialog'
import { ListSectionDivider } from '@/components/shared/ListSectionDivider'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { LocationSwitcher } from '@/components/shared/LocationSwitcher'
import { ViewToggle } from '@/components/shared/ViewToggle'
import { Button } from '@/components/ui/button'
import { useStockedItems, useUpdateItem } from '@/hooks'
import { useDataMode } from '@/hooks/useDataMode'
import { useItemSearchTailWiring } from '@/hooks/useItemSearchTailWiring'
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
import { isInactive, isStockedHere } from '@/lib/quantityUtils'
import { sortItems } from '@/lib/sortUtils'
import { getStoredGroupBy, setPantryView } from '@/lib/viewPreference'
import type { PantryItem, Recipe, StockFields, Vendor } from '@/types'

export function PantryListView() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const { data: items = [], isLoading } = useStockedItems()
  const { data: tags = [], isLoading: isTagsLoading } = useTags()
  const { data: tagTypes = [], isLoading: isTagTypesLoading } = useTagTypes()
  const { data: vendors = [], isLoading: isVendorsLoading } = useVendors()
  const { data: recipes = [], isLoading: isRecipesLoading } = useRecipes()
  const updateItem = useUpdateItem()
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
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

  const allDataLoaded =
    !isLoading &&
    !isTagsLoading &&
    !isTagTypesLoading &&
    !isVendorsLoading &&
    !isRecipesLoading
  const currentUrl = useRouterState({
    select: (s) => s.location.pathname + (s.location.searchStr ?? ''),
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const { restoreScroll } = useScrollRestoration(currentUrl, scrollRef)
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

  const searchedItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )

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

  const sortedItems = sortItems(
    search.trim() ? searchedItems : filteredItems,
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    allPurchaseDates ?? new Map(),
    sortBy,
    sortDirection,
  )

  const activeItems = sortedItems.filter((item) => !isInactive(item))
  const inactiveItems = sortedItems.filter((item) => isInactive(item))

  const activeTagIds = useMemo(
    () => Object.values(filterState).flat(),
    [filterState],
  )

  const handleTagClick = (tagId: string) => {
    const tag = tags.find((t) => t.id === tagId)
    if (!tag) return

    const tagType = tagTypes.find((t) => t.id === tag.typeId)
    if (!tagType) return

    const existingTags = filterState[tagType.id] || []

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

  // The ids the pantry ALREADY renders — deliberately the FULL stocked-here
  // set (`items`, from useStockedItems()), NOT the filtered/sorted display
  // list. Bucket 1 is every item stocked in the active location, so bucket 2
  // (stocked here, absent from the page's list) is empty by construction —
  // which is why this page passes neither `groupAction` nor `groupNote`
  // below. Sourcing this from a filtered variable (e.g. the tag/vendor
  // filtered list) would wrongly land a filtered-out stocked-here item in
  // bucket 2 instead of bucket 1 — but NOT render it nowhere: while a search
  // is active, `searchedItems` above is built from the full `items` and
  // bypasses the filters entirely, so the item would still show in the main
  // list. Only the TAIL would omit it (bucket 2 is unreachable here — no
  // groupAction/groupNote — so it would just silently vanish from the tail).
  const inGroupIds = useMemo(() => new Set(items.map((i) => i.id)), [items])

  // Tail rows can include items outside the pantry's own `items` (stocked
  // here) array — bucket 3 is exactly the items NOT stocked here — so their
  // vendor badges can't come from `vendorMap`, which is only keyed over
  // `items`. Computed directly per row instead; these lists are always small
  // while a search is active. `recipeMap` doesn't have this problem — it's
  // already built from the global `recipes` list, not from `items`.
  function renderTailItemCard(item: PantryItem) {
    return (
      <ItemCard
        item={item}
        tags={tags.filter((t) => item.tagIds.includes(t.id))}
        tagTypes={tagTypes}
        showTags={isTagsVisible}
        vendors={vendors.filter((v) => (item.vendorIds ?? []).includes(v.id))}
        recipes={recipeMap.get(item.id) ?? []}
        activeVendorIds={selectedVendorIds}
        activeRecipeIds={selectedRecipeIds}
        activeTagIds={activeTagIds}
        showStock={isCloud || isStockedHere(item)}
        onTagClick={handleTagClick}
        onVendorClick={handleVendorClick}
        onRecipeClick={handleRecipeClick}
      />
    )
  }

  const { tailProps, hasTail, hasExactGlobalMatch } = useItemSearchTailWiring({
    inGroupIds,
    query: search,
    renderItem: renderTailItemCard,
    sortTail: (list) =>
      sortItems(
        list,
        allQuantities ?? new Map(),
        allExpiryDates ?? new Map(),
        allPurchaseDates ?? new Map(),
        sortBy,
        sortDirection,
      ),
  })

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
          isRelationsToggleEnabled
          items={items}
          className="border-b"
          onCreateFromSearch={handleCreateFromSearch}
          hasExactMatch={hasExactGlobalMatch}
          vendors={vendors}
          recipes={recipes}
          leading={
            <>
              <LocationSwitcher className="lg:hidden" />
              <ViewToggle
                current="list"
                onChange={(view) => {
                  if (view === 'group') {
                    setPantryView('group')
                    navigate({
                      to: '/',
                      search: { groupBy: getStoredGroupBy() },
                    })
                  }
                }}
              />
            </>
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
      <div
        ref={scrollRef}
        data-testid="pantry-scroll"
        className="overflow-y-auto [container-type:size]"
      >
        {items.length === 0 && !hasTail ? (
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
        ) : sortedItems.length === 0 && !hasTail ? (
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
              <ListSectionDivider>
                {t('shopping.inactiveItems', { count: inactiveItems.length })}
              </ListSectionDivider>
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

            {search.trim() && <ItemSearchTail {...tailProps} />}
          </div>
        )}
        {quickUpdateItem && (
          <QuickUpdateDialog
            item={quickUpdateItem}
            isOpen={true}
            onClose={() => setQuickUpdateItemId(null)}
            onSubmit={async (updates) => {
              // Forwarded as-is: `updates` carries a `dueDate` key only when
              // the dialog actually rendered that field (expirationMode ===
              // 'date'), and the mutation must see that same absence — see
              // the doc comment on `QuickUpdateDialogProps.onSubmit`.
              setPendingItemIds((prev) => new Set(prev).add(quickUpdateItem.id))
              try {
                await updateItem.mutateAsync({
                  id: quickUpdateItem.id,
                  // `dueDate?: Date | undefined` (the dialog's conditional
                  // presence) vs `StockFields`' `dueDate?: Date` — see the
                  // same cast in `routes/items/$id/stock.tsx`.
                  updates: updates as Partial<StockFields>,
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

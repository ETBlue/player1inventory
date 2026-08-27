import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowUpFromLine, Settings } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemListToolbar } from '@/components/item/ItemListToolbar'
import { ItemSearchTail } from '@/components/item/ItemSearchTail'
import { QuickUpdateDialog } from '@/components/item/QuickUpdateDialog'
import { ListSectionDivider } from '@/components/shared/ListSectionDivider'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { LocationSwitcher } from '@/components/shared/LocationSwitcher'
import { Button } from '@/components/ui/button'
import { useCreateItem, useStockedItems, useUpdateItem } from '@/hooks'
import { useItemSearchTailWiring } from '@/hooks/useItemSearchTailWiring'
import { useItemSortData } from '@/hooks/useItemSortData'
import { useRecipes } from '@/hooks/useRecipes'
import {
  useShelfQuery,
  useShelvesQuery,
  useUpdateShelfMutation,
} from '@/hooks/useShelves'
import { useShowStock } from '@/hooks/useShowStock'
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
import { matchesFilterConfig } from '@/lib/shelfUtils'
import { type SortDirection, type SortField, sortItems } from '@/lib/sortUtils'
import type { PantryItem, StockFields } from '@/types'

interface ShelfDetailViewProps {
  shelfId: string
}

export function ShelfDetailView({ shelfId }: ShelfDetailViewProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isUnsorted = shelfId === 'unsorted'

  const { data: allItems = [], isLoading: isItemsLoading } = useStockedItems()
  const { data: allShelves = [], isLoading: isShelvesLoading } =
    useShelvesQuery()
  const { data: shelf, isLoading: isShelfLoading } = useShelfQuery(
    isUnsorted ? '' : shelfId,
  )
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
  const { data: vendors = [] } = useVendors()
  const { data: recipes = [] } = useRecipes()

  const updateShelf = useUpdateShelfMutation()
  const updateItem = useUpdateItem()
  const createItem = useCreateItem()
  const showStock = useShowStock()

  const {
    sortBy: localSortBy,
    sortDirection: localSortDirection,
    setSortBy,
    setSortDirection,
  } = useSortFilter('shelf-detail', { defaultSortBy: 'name' })

  const sortBy: SortField = localSortBy
  const sortDirection: SortDirection = localSortDirection

  const {
    search,
    isTagsVisible,
    filterState,
    selectedVendorIds,
    selectedRecipeIds,
  } = useUrlSearchAndFilters()

  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set())
  const [quickUpdateItemId, setQuickUpdateItemId] = useState<string | null>(
    null,
  )
  const quickUpdateItem =
    allItems.find((i) => i.id === quickUpdateItemId) ?? null

  const { quantities, expiryDates, purchaseDates } = useItemSortData(allItems)

  const inShelfItems = useMemo((): PantryItem[] => {
    if (isUnsorted) {
      const selectionShelfItemIds = new Set<string>()
      for (const s of allShelves) {
        if (s.type === 'selection') {
          for (const id of s.itemIds ?? []) {
            selectionShelfItemIds.add(id)
          }
        }
      }
      const filterMatchedItemIds = new Set<string>()
      for (const s of allShelves) {
        if (s.type === 'filter' && s.filterConfig) {
          for (const item of allItems) {
            if (matchesFilterConfig(item, s.filterConfig, recipes, tags)) {
              filterMatchedItemIds.add(item.id)
            }
          }
        }
      }
      return allItems.filter(
        (item) =>
          !selectionShelfItemIds.has(item.id) &&
          !filterMatchedItemIds.has(item.id),
      )
    }

    if (!shelf) return []

    if (shelf.type === 'filter') {
      const { filterConfig } = shelf
      if (!filterConfig) return []
      return allItems.filter((item) =>
        matchesFilterConfig(item, filterConfig, recipes, tags),
      )
    }

    const itemMap = new Map(allItems.map((i) => [i.id, i]))
    return (shelf.itemIds ?? []).flatMap((id) => {
      const item = itemMap.get(id)
      return item ? [item] : []
    })
  }, [isUnsorted, shelf, allItems, allShelves, recipes, tags])

  const sortedInShelfItems = useMemo((): PantryItem[] => {
    return sortItems(
      inShelfItems,
      quantities ?? new Map(),
      expiryDates ?? new Map(),
      purchaseDates ?? new Map(),
      sortBy,
      sortDirection,
    )
  }, [
    inShelfItems,
    sortBy,
    sortDirection,
    quantities,
    expiryDates,
    purchaseDates,
  ])

  const trimmedSearch = search.trim()

  const displayedInShelfItems = useMemo(() => {
    if (trimmedSearch) {
      return sortedInShelfItems.filter((item) =>
        item.name.toLowerCase().includes(trimmedSearch.toLowerCase()),
      )
    }
    if (!isUnsorted) return sortedInShelfItems
    const tagFiltered = filterItems(sortedInShelfItems, filterState, tags)
    const vendorFiltered = filterItemsByVendors(tagFiltered, selectedVendorIds)
    return filterItemsByRecipes(vendorFiltered, selectedRecipeIds, recipes)
  }, [
    isUnsorted,
    sortedInShelfItems,
    trimmedSearch,
    filterState,
    selectedVendorIds,
    selectedRecipeIds,
    recipes,
    tags,
  ])

  const inShelfItemIds = useMemo(
    () => new Set(inShelfItems.map((i) => i.id)),
    [inShelfItems],
  )

  // Tail rows can fall outside `allItems` (stocked-here items) — bucket 3 is
  // exactly the items NOT stocked here — so vendor badges can't come from the
  // `vendorMap` below, which is only keyed over `allItems`. Computed directly
  // per row instead (mirrors PantryListView's tail card). `recipeMap` doesn't
  // have this problem — like PantryListView's, it's built from the global
  // `recipes` list, not from `allItems`, so it already covers bucket-3 items.
  function renderTailItemCard(item: PantryItem) {
    return (
      <ItemCard
        item={item}
        tags={tags.filter((t) => item.tagIds.includes(t.id))}
        tagTypes={tagTypes}
        vendors={vendors.filter((v) => (item.vendorIds ?? []).includes(v.id))}
        recipes={recipeMap.get(item.id) ?? []}
        showTags={isTagsVisible}
        showStock={showStock(item)}
      />
    )
  }

  // Bucket 2's action, selection shelves only: pressing it appends the item
  // to the shelf's itemIds. The dedup check is the same "already-present"
  // guard `handleAddToSelectionShelf` used to run before this hook took over,
  // and it is LOAD-BEARING, not a defensive no-op: it fires during the
  // `useItems` / `useStockedItems` refetch skew, when an item already on this
  // shelf briefly renders in bucket 2 with a live button. `inShelfItemIds` is
  // derived from `useStockedItems()` (query key `['items', 'stocked',
  // {locationId}]`) while the tail's buckets come from `useItems()`
  // (`['items', {locationId}]`) — two separate cache entries that a mutation
  // invalidates together but which refetch INDEPENDENTLY, so the tail can see
  // the item as stocked-here (bucket 2) while the stale `inShelfItemIds`
  // still omits it. Pressing it again without this guard appends a DUPLICATE
  // id to `itemIds`. Do not "clean it up".
  //
  // Filter shelves get `groupNote` instead: PR D's swap point. The design's
  // end state is a per-axis picker (one tag per tag type, one vendor, one
  // recipe — enough to satisfy matchesFilterConfig) so a filter-shelf bucket
  // 2 row becomes actionable; until then this inert note keeps the row from
  // vanishing silently, the way the old hand-rolled block rendered it inert.
  //
  // System shelves and the `unsorted` pseudo-shelf get neither — they already
  // have no add path (handleAddToSelectionShelf used to early-return for
  // them), and inventing one is out of scope here.
  //
  // No `sortTail` is passed here, unlike the cart page and PantryListView —
  // so the tail renders in name order while this shelf's own list obeys the
  // user's chosen sort. This is a DELIBERATE, DEFERRED gap, not an oversight:
  // `useItemSortData` above is keyed only over `allItems` (stocked-here
  // items), so a bucket-3 row (not stocked here) would sort against an absent
  // map entry. Fixing it properly means widening that sort-data source, which
  // is a behaviour change deserving its own review — out of scope for this
  // pass.
  const { tailProps, hasTail, hasExactGlobalMatch } = useItemSearchTailWiring({
    inGroupIds: inShelfItemIds,
    query: search,
    renderItem: renderTailItemCard,
    ...(shelf?.type === 'selection'
      ? {
          groupAction: {
            label: t('items.searchTail.addToShelf'),
            icon: <ArrowUpFromLine />,
            onAction: async (item: PantryItem) => {
              const currentIds = shelf.itemIds ?? []
              if (currentIds.includes(item.id)) return
              await updateShelf.mutateAsync({
                id: shelf.id,
                data: { itemIds: [...currentIds, item.id] },
              })
            },
          },
        }
      : {}),
    ...(shelf?.type === 'filter'
      ? {
          groupNote: () => (
            <span>{t('items.searchTail.notMatchingShelf')}</span>
          ),
        }
      : {}),
  })

  const handleSortChange = (field: SortField, dir: SortDirection) => {
    setSortBy(field)
    setSortDirection(dir)
  }

  const handleCreateFromSearch = async (query: string) => {
    try {
      const newItem = await createItem.mutateAsync({
        name: query,
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
      })
      if (shelf?.type === 'selection' && newItem?.id) {
        const currentIds = shelf.itemIds ?? []
        updateShelf.mutate({
          id: shelf.id,
          data: { itemIds: [...currentIds, newItem.id] },
        })
      }
    } catch {
      // input stays populated for retry
    }
  }

  const isLoading =
    isItemsLoading || isShelvesLoading || (!isUnsorted && isShelfLoading)

  if (isLoading) {
    return <LoadingSpinner />
  }

  const shelfName = isUnsorted ? 'Unsorted' : (shelf?.name ?? 'Shelf')

  const vendorMap = new Map(
    allItems.map((item) => [
      item.id,
      vendors.filter((v) => item.vendorIds?.includes(v.id) ?? false),
    ]),
  )

  const recipeMap = new Map<string, typeof recipes>()
  for (const recipe of recipes) {
    for (const ri of recipe.items) {
      const existing = recipeMap.get(ri.itemId) ?? []
      recipeMap.set(ri.itemId, [...existing, recipe])
    }
  }

  return (
    <div className="h-screen grid grid-rows-[auto_1fr]">
      <div>
        <ItemListToolbar
          className="border-b-1"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSortChange={handleSortChange}
          isRelationsToggleEnabled={true}
          hideFiltersToggle={!isUnsorted}
          items={inShelfItems}
          vendors={vendors}
          recipes={recipes}
          onCreateFromSearch={handleCreateFromSearch}
          hasExactMatch={hasExactGlobalMatch}
          isCreating={createItem.isPending}
          leading={
            <>
              {/* Leftmost, ahead of the back button — the placement every
                  other toolbar uses (shopping, cooking, pantry group views). */}
              <LocationSwitcher className="lg:hidden" />
              <Button
                variant="neutral-ghost"
                size="icon"
                className="lg:w-auto lg:mr-3 flex-shrink-0"
                onClick={() =>
                  navigate({ to: '/', search: { groupBy: 'shelf' } })
                }
                aria-label="Go back"
              >
                <ArrowLeft />
                <span className="hidden lg:inline">Go back</span>
              </Button>
              <h1 className="text-base font-regular truncate capitalize">
                {shelfName}
              </h1>
            </>
          }
        >
          {!isUnsorted && (
            <Link
              to="/settings/shelves/$shelfId"
              params={{ shelfId }}
              aria-label="Shelf settings"
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
          {(() => {
            const activeDisplayed = displayedInShelfItems.filter(
              (item) => !isInactive(item),
            )
            const inactiveDisplayed = displayedInShelfItems.filter((item) =>
              isInactive(item),
            )

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

            return (
              <>
                {activeDisplayed.map(renderItemCard)}
                {inactiveDisplayed.length > 0 && (
                  <ListSectionDivider>
                    {t('shopping.inactiveItems', {
                      count: inactiveDisplayed.length,
                    })}
                  </ListSectionDivider>
                )}
                {inactiveDisplayed.map(renderItemCard)}
              </>
            )
          })()}

          {trimmedSearch && <ItemSearchTail {...tailProps} />}

          {!hasTail && sortedInShelfItems.length === 0 && (
            <div className="text-center py-12 text-foreground-muted">
              <p className="font-medium">No items</p>
              <p className="text-sm mt-1">
                {isUnsorted
                  ? 'All items are assigned to shelves'
                  : shelf?.type === 'filter'
                    ? 'No items match the filter'
                    : 'Search to add items to this shelf'}
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
          onSubmit={async (updates) => {
            // Forwarded as-is: `updates` carries a `dueDate` key only when the
            // dialog actually rendered that field (expirationMode === 'date'),
            // and the mutation must see that same absence — see the doc
            // comment on `QuickUpdateDialogProps.onSubmit`.
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
  )
}

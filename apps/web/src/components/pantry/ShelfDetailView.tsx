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
import { ShelfFilterPicksDialog } from '@/components/shelf/ShelfFilterPicksDialog'
import { Button } from '@/components/ui/button'
import { useCreateItem, useStockedItems, useUpdateItem } from '@/hooks'
import { useApplyShelfFilterPicks } from '@/hooks/useApplyShelfFilterPicks'
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
import {
  deriveFilterAxes,
  type FilterPicks,
  isFilterConfigSatisfiable,
  matchesFilterConfig,
} from '@/lib/shelfUtils'
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
  const applyPicks = useApplyShelfFilterPicks()
  const [picksItem, setPicksItem] = useState<PantryItem | null>(null)

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

  // Whether ANY item could be made to match — an axis naming only deleted
  // entities cannot be satisfied by any press, and `groupAction` is one
  // descriptor for the WHOLE section, so such a shelf keeps the inert
  // `groupNote` rather than showing a button that cannot work.
  const filterConfig = shelf?.type === 'filter' ? shelf.filterConfig : undefined
  const canJoinFilterShelf =
    !!filterConfig && isFilterConfigSatisfiable(filterConfig, vendors, recipes)

  const axesFor = (item: PantryItem) =>
    filterConfig
      ? deriveFilterAxes(item, filterConfig, tags, tagTypes, vendors, recipes)
      : []

  // The dialog's item, re-read from `allItems` rather than the frozen
  // `picksItem` snapshot: `picksItem` is a `useState` set once at press time
  // and never updates again, so if the item's tags/vendors/recipes change
  // while the dialog is still open — a concurrent edit from another tab or
  // surface, whose write invalidates `['items']` — an in-dialog retry would
  // otherwise recompute axes against the SAME stale item and re-offer (and
  // re-write) an axis that already landed elsewhere. Deriving live from
  // `allItems` is what makes "the dialog recomputes which axes are met" true;
  // `ShelfDetailView.test.tsx:555-575` exercises exactly this by mutating the
  // item directly and invalidating `['items']` from outside the dialog. The
  // `?? picksItem` fallback exists only for a concurrent removal
  // mid-interaction — a bucket-2 row is stocked here, so it is normally
  // present in `allItems`.
  const livePicksItem = picksItem
    ? (allItems.find((i) => i.id === picksItem.id) ?? picksItem)
    : null

  // Applies the picks the user made (or the ones that needed no choice).
  const applyFilterPicks = async (item: PantryItem, picks: FilterPicks) => {
    const recipe = picks.recipeId
      ? recipes.find((r) => r.id === picks.recipeId)
      : undefined
    await applyPicks.mutateAsync({
      item,
      addTagIds: picks.tagIds,
      addVendorIds: picks.vendorId ? [picks.vendorId] : [],
      ...(recipe ? { recipe: { id: recipe.id, items: recipe.items } } : {}),
    })
  }

  // Bucket 2's action, selection shelves only: pressing it appends the item
  // to the shelf's itemIds. The dedup check is the same "already-present"
  // guard `handleAddToSelectionShelf` used to run before this hook took over,
  // and it is LOAD-BEARING, not a defensive no-op: any time an item already on
  // this shelf renders in bucket 2 with a live button, a second press appends
  // a DUPLICATE id to `itemIds`. Do not "clean it up".
  //
  // The tail's OWN press no longer opens that window: `useUpdateShelfMutation`'s
  // local `onSuccess` RETURNS its `['shelves']` invalidation, so `mutateAsync`
  // resolves only once `shelf.itemIds` has refetched, and the wiring hook
  // re-enables the rows against fresh data. What the guard still covers is
  // every path that does NOT await that refetch — `mutate` call sites, cloud
  // mode, and any concurrent write (another surface, another tab) landing
  // between this render and the press.
  //
  // Filter shelves get a `groupAction` too: pressing it always opens
  // `ShelfFilterPicksDialog` (designer ruling, 2026-08-28, reversing the
  // direct-apply bypass this shipped with — see the dated addendum in
  // docs/features/items/2026-08-26-unified-item-search-design.md's "Filter
  // shelves" section). The dialog is a double-confirm step for the
  // tags/vendors/recipe about to be applied, not only a disambiguation
  // step, so it opens even when every axis has just one option.
  // `defaultPicksFor` still matters — the dialog uses it to pre-select a
  // single-option axis so Confirm is enabled immediately — but this
  // component no longer branches on option counts itself. `groupNote`
  // survives only for a shelf whose `filterConfig` is unsatisfiable
  // outright (e.g. a vendor or recipe axis naming only deleted entities);
  // `canJoinFilterShelf` above decides that once per shelf.
  //
  // System shelves and the `unsorted` pseudo-shelf get neither — they already
  // have no add path (handleAddToSelectionShelf used to early-return for
  // them), and inventing one is out of scope here.
  //
  // `sortTail` hands BOTH tail sections the same sort the page's own list
  // uses, so a search result no longer flips to name order mid-page.
  //
  // Residual, accepted: a bucket-3 row is not stocked here, so it carries
  // ZERO_STOCK and has no entry in any of the three sort maps (they are keyed
  // over `allItems`, i.e. stocked-here items). `sortItems` handles every one
  // of those absences explicitly — `?? 0`, `?? null`, `undefined` — so nothing
  // breaks, but under `stock`, `purchased` and `expiring` every bucket-3 row
  // then compares EQUAL to every other, and the section keeps the tail's own
  // name order. Only `name` actually reorders bucket 3. Bucket 2 IS stocked
  // here, so it is in the maps and sorts fully by every field.
  //
  // That residual is the shipped behaviour on the flat pantry already:
  // `PantryListView` passes `sortTail` while feeding `useItemSortData` from
  // `useStockedItems()` — the identical shape. Widening the sort-data source
  // to cover the tail is the expensive alternative and is deliberately not
  // taken: its expiry and purchase maps do one Dexie read per item and embed
  // a `join(',')` of the whole input list in their cache keys, so widening
  // busts both caches and multiplies the queries.
  const { tailProps, hasTail, hasExactGlobalMatch } = useItemSearchTailWiring({
    inGroupIds: inShelfItemIds,
    query: search,
    renderItem: renderTailItemCard,
    sortTail: (list) =>
      sortItems(
        list,
        quantities ?? new Map(),
        expiryDates ?? new Map(),
        purchaseDates ?? new Map(),
        sortBy,
        sortDirection,
      ),
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
    ...(shelf?.type === 'filter' && canJoinFilterShelf
      ? {
          groupAction: {
            label: t('items.searchTail.addToShelf'),
            icon: <ArrowUpFromLine />,
            onAction: async (item: PantryItem) => {
              // Always open the dialog — never apply directly, regardless
              // of how many options each axis offers (designer ruling,
              // 2026-08-28: "the concept is to provide a chance to double
              // confirm the tags/vendors/recipes that are about to be
              // applied to the item"). A single-option axis still needs no
              // interaction — `ShelfFilterPicksDialog` pre-selects it via
              // `defaultPicksFor` so Confirm is enabled immediately — but
              // the user always sees the picks before they land.
              //
              // This resolves immediately, so the wiring hook clears its
              // pending id right away and the row never spins. That is
              // correct: the dialog is modal and owns the wait from here,
              // including its own pending state and inline error.
              setPicksItem(item)
            },
          },
        }
      : {}),
    ...(shelf?.type === 'filter' && !canJoinFilterShelf
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
      {livePicksItem && (
        <ShelfFilterPicksDialog
          open
          onOpenChange={(v) => !v && setPicksItem(null)}
          itemName={livePicksItem.name}
          shelfName={shelfName}
          axes={axesFor(livePicksItem)}
          onConfirm={(picks) => applyFilterPicks(livePicksItem, picks)}
        />
      )}
    </div>
  )
}

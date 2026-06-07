import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowUpFromLine, Loader2, Settings } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemListToolbar } from '@/components/item/ItemListToolbar'
import { QuickUpdateDialog } from '@/components/item/QuickUpdateDialog'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { useCreateItem, useItems, useUpdateItem } from '@/hooks'
import { useItemSortData } from '@/hooks/useItemSortData'
import { useRecipes } from '@/hooks/useRecipes'
import {
  useShelfQuery,
  useShelvesQuery,
  useUpdateShelfMutation,
} from '@/hooks/useShelves'
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
import type { Item } from '@/types'

interface ShelfDetailViewProps {
  shelfId: string
}

export function ShelfDetailView({ shelfId }: ShelfDetailViewProps) {
  const navigate = useNavigate()
  const isUnsorted = shelfId === 'unsorted'

  const { data: allItems = [], isLoading: isItemsLoading } = useItems()
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

  const inShelfItems = useMemo((): Item[] => {
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

  const sortedInShelfItems = useMemo((): Item[] => {
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

  const hasExactMatch = useMemo(() => {
    if (!trimmedSearch) return false
    const lower = trimmedSearch.toLowerCase()
    return allItems.some((item) => item.name.toLowerCase() === lower)
  }, [allItems, trimmedSearch])

  const inShelfItemIds = useMemo(
    () => new Set(inShelfItems.map((i) => i.id)),
    [inShelfItems],
  )

  const outsideShelfSearchMatches = useMemo((): Item[] => {
    if (!trimmedSearch) return []
    return allItems.filter(
      (item) =>
        !inShelfItemIds.has(item.id) &&
        item.name.toLowerCase().includes(trimmedSearch.toLowerCase()),
    )
  }, [allItems, inShelfItemIds, trimmedSearch])

  const handleSortChange = (field: SortField, dir: SortDirection) => {
    setSortBy(field)
    setSortDirection(dir)
  }

  const handleAddToSelectionShelf = (itemId: string) => {
    if (!shelf || shelf.type !== 'selection') return
    const currentIds = shelf.itemIds ?? []
    if (currentIds.includes(itemId)) return
    updateShelf.mutate({
      id: shelf.id,
      data: { itemIds: [...currentIds, itemId] },
    })
  }

  const handleCreateFromSearch = async (query: string) => {
    const newItem = await createItem.mutateAsync({
      name: query,
      tagIds: [],
      vendorIds: [],
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    })
    if (shelf?.type === 'selection' && newItem?.id) {
      const currentIds = shelf.itemIds ?? []
      updateShelf.mutate({
        id: shelf.id,
        data: { itemIds: [...currentIds, newItem.id] },
      })
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
          isTagsToggleEnabled={true}
          hideFiltersToggle={!isUnsorted}
          items={inShelfItems}
          vendors={vendors}
          recipes={recipes}
          onCreateFromSearch={handleCreateFromSearch}
          hasExactMatch={hasExactMatch}
          isCreating={createItem.isPending}
          leading={
            <>
              <Button
                variant="neutral-ghost"
                size="icon"
                className="lg:w-auto lg:mr-3"
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

            const renderItemCard = (item: Item) => (
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
                  <div className="bg-background-surface px-3 py-2 text-foreground-muted text-center text-sm">
                    {inactiveDisplayed.length} inactive item
                    {inactiveDisplayed.length !== 1 ? 's' : ''}
                  </div>
                )}
                {inactiveDisplayed.map(renderItemCard)}
              </>
            )
          })()}

          {trimmedSearch && outsideShelfSearchMatches.length > 0 && (
            <div className="space-y-px">
              <div className="h-px bg-accessory-default" />
              <p className="text-xs text-foreground-muted text-center py-1">
                Not in this shelf
              </p>
              {outsideShelfSearchMatches.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center bg-background-surface"
                >
                  <div className="flex-1 min-w-0">
                    <ItemCard
                      item={item}
                      tags={tags.filter((t) => item.tagIds.includes(t.id))}
                      tagTypes={tagTypes}
                      vendors={vendorMap.get(item.id) ?? []}
                      recipes={recipeMap.get(item.id) ?? []}
                      showTags={isTagsVisible}
                    />
                  </div>
                  {shelf?.type === 'selection' && (
                    <Button
                      size="icon"
                      variant="neutral-outline"
                      className="mx-2"
                      aria-label={`Add ${item.name} to shelf`}
                      onClick={() => handleAddToSelectionShelf(item.id)}
                      disabled={updateShelf.isPending}
                    >
                      {updateShelf.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowUpFromLine />
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!trimmedSearch && sortedInShelfItems.length === 0 && (
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

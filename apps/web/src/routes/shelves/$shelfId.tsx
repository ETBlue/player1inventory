import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpFromLine,
  Filter,
  Plus,
  Search,
  Settings,
  Tags,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemFilters } from '@/components/item/ItemFilters'
import { FilterStatus } from '@/components/shared/FilterStatus'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useCreateItem, useItems, useUpdateItem } from '@/hooks'
import { useAppNavigation } from '@/hooks/useAppNavigation'
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
import { addItem, consumeItem, isInactive } from '@/lib/quantityUtils'
import { matchesFilterConfig } from '@/lib/shelfUtils'
import { type SortDirection, type SortField, sortItems } from '@/lib/sortUtils'
import type { Item } from '@/types'

export const Route = createFileRoute('/shelves/$shelfId')({
  component: ShelfDetailPage,
})

// ── Sort labels ────────────────────────────────────────────────────────────

const sortLabels: Record<string, string> = {
  name: 'Name',
  stock: 'Stock',
  expiring: 'Expiring',
  purchased: 'Last purchased',
}

// ── Main page ──────────────────────────────────────────────────────────────

export function ShelfDetailPage() {
  const { shelfId } = Route.useParams()
  const isUnsorted = shelfId === 'unsorted'

  // Data
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
  const { goBack } = useAppNavigation('/shelves')

  // Sort: non-unsorted shelves use filterConfig (DB); unsorted uses localStorage
  const {
    sortBy: localSortBy,
    sortDirection: localSortDirection,
    setSortBy,
    setSortDirection,
  } = useSortFilter('shelf-detail', { defaultSortBy: 'name' })

  const isShelfWithConfig = !isUnsorted && shelf !== undefined

  const sortBy: SortField = isShelfWithConfig
    ? ((shelf?.sortBy === 'lastPurchased'
        ? 'purchased'
        : (shelf?.sortBy ?? 'name')) as SortField)
    : localSortBy
  const sortDirection: SortDirection = isShelfWithConfig
    ? (shelf?.sortDir ?? 'asc')
    : localSortDirection

  // Search / filter state (URL-backed for back-navigation restoration)
  const {
    search,
    setSearch,
    isTagsVisible,
    setIsTagsVisible,
    isFiltersVisible,
    setIsFiltersVisible,
    filterState,
    selectedVendorIds,
    selectedRecipeIds,
    clearAllFilters,
  } = useUrlSearchAndFilters()

  const [searchVisible, setSearchVisible] = useState(() => !!search.trim())

  const { quantities, expiryDates, purchaseDates } = useItemSortData(allItems)

  // ── Compute in-shelf items ──────────────────────────────────────────────

  const inShelfItems = useMemo((): Item[] => {
    if (isUnsorted) {
      // Compute items claimed by selection shelves
      const selectionShelfItemIds = new Set<string>()
      for (const s of allShelves) {
        if (s.type === 'selection') {
          for (const id of s.itemIds ?? []) {
            selectionShelfItemIds.add(id)
          }
        }
      }
      // Compute items matched by filter shelves
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

    // Selection shelf: items in shelf.itemIds order
    const itemMap = new Map(allItems.map((i) => [i.id, i]))
    return (shelf.itemIds ?? []).flatMap((id) => {
      const item = itemMap.get(id)
      return item ? [item] : []
    })
  }, [isUnsorted, shelf, allItems, allShelves, recipes, tags])

  // ── Sort in-shelf items ─────────────────────────────────────────────────

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

  // ── Search ─────────────────────────────────────────────────────────────

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

  const hasActiveFilters = useMemo(
    () =>
      Object.values(filterState).some((ids) => ids.length > 0) ||
      selectedVendorIds.length > 0 ||
      selectedRecipeIds.length > 0,
    [filterState, selectedVendorIds, selectedRecipeIds],
  )

  // ── Sort handler ─────────────────────────────────────────────────────────

  const handleSortChange = (field: SortField, dir: SortDirection) => {
    if (isShelfWithConfig && shelf) {
      const rawSortBy = field === 'purchased' ? 'lastPurchased' : field
      updateShelf.mutate({
        id: shelf.id,
        data: {
          sortBy: rawSortBy as 'name' | 'stock' | 'expiring' | 'lastPurchased',
          sortDir: dir,
        },
      })
    } else {
      setSortBy(field)
      setSortDirection(dir)
    }
  }

  // ── Shelf membership handlers ───────────────────────────────────────────

  const handleAddToSelectionShelf = (itemId: string) => {
    if (!shelf || shelf.type !== 'selection') return
    const currentIds = shelf.itemIds ?? []
    if (currentIds.includes(itemId)) return
    updateShelf.mutate({
      id: shelf.id,
      data: { itemIds: [...currentIds, itemId] },
    })
  }

  // ── Create from search ──────────────────────────────────────────────────

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

  // ── Loading state ───────────────────────────────────────────────────────

  const isLoading =
    isItemsLoading || isShelvesLoading || (!isUnsorted && isShelfLoading)

  if (isLoading) {
    return <LoadingSpinner />
  }

  // ── Determine shelf display name ─────────────────────────────────────────

  const shelfName = isUnsorted ? 'Unsorted' : (shelf?.name ?? 'Shelf')

  // ── Vendor / recipe maps for ItemCard ────────────────────────────────────

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

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-screen grid grid-rows-[auto_1fr]">
      {/* Fixed top section: top bar + filter dropdowns + sort/search toolbar */}
      <div>
        <Toolbar className="border-b-1">
          <Button
            variant="neutral-ghost"
            size="icon"
            className="lg:w-auto lg:mr-3"
            onClick={goBack}
            aria-label="Go back"
          >
            <ArrowLeft />
            <span className="hidden lg:inline">Go back</span>
          </Button>
          <h1 className="text-md font-regular truncate flex-1 capitalize">
            {shelfName}
          </h1>
          {isUnsorted && (
            <div className="flex items-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="default"
                    variant="neutral-ghost"
                    aria-label="Sort by"
                    className="px-2 font-normal"
                  >
                    {sortLabels[sortBy]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {(['expiring', 'name', 'stock', 'purchased'] as const).map(
                    (field) => (
                      <DropdownMenuItem
                        key={field}
                        className={
                          sortBy === field ? 'bg-background-elevated' : ''
                        }
                        onClick={() => handleSortChange(field, sortDirection)}
                      >
                        {sortLabels[field]}
                      </DropdownMenuItem>
                    ),
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="icon"
                variant="neutral-ghost"
                onClick={() =>
                  handleSortChange(
                    sortBy,
                    sortDirection === 'asc' ? 'desc' : 'asc',
                  )
                }
                aria-label="Toggle sort direction"
                className="lg:w-auto lg:px-3"
              >
                {sortDirection === 'asc' ? <ArrowUp /> : <ArrowDown />}
                <span className="hidden lg:inline">
                  {sortDirection === 'asc' ? 'Asc' : 'Desc'}
                </span>
              </Button>
            </div>
          )}
          <Button
            size="icon"
            variant={isTagsVisible ? 'neutral' : 'neutral-ghost'}
            onClick={() => setIsTagsVisible(!isTagsVisible)}
            aria-label="Toggle tags"
            className="lg:w-auto lg:px-3"
          >
            <Tags />
            <span className="hidden lg:inline">Tags</span>
          </Button>
          {isUnsorted && (
            <Button
              size="icon"
              variant={
                isFiltersVisible || hasActiveFilters
                  ? 'neutral'
                  : 'neutral-ghost'
              }
              onClick={() => setIsFiltersVisible(!isFiltersVisible)}
              aria-label="Toggle filters"
              className="lg:w-auto lg:px-3"
            >
              <Filter />
              <span className="hidden lg:inline">Filters</span>
            </Button>
          )}
          <Button
            size="icon"
            variant={searchVisible ? 'neutral' : 'neutral-ghost'}
            onClick={() => {
              if (searchVisible) {
                setSearch('')
              }
              setSearchVisible((v) => !v)
            }}
            aria-label="Toggle search"
            className="lg:w-auto lg:px-3"
          >
            <Search />
            <span className="hidden lg:inline">Search</span>
          </Button>
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
        </Toolbar>

        {/* Filter panel — unsorted only */}
        {isUnsorted && (isFiltersVisible || hasActiveFilters) && (
          <>
            <div className="h-px bg-accessory-default" />
            <ItemFilters
              items={inShelfItems}
              disabled={!!trimmedSearch}
              vendors={vendors}
              recipes={recipes}
            />
            <FilterStatus
              filteredCount={displayedInShelfItems.length}
              totalCount={inShelfItems.length}
              hasActiveFilters={hasActiveFilters}
              onClearAll={clearAllFilters}
              disabled={!!trimmedSearch}
            />
          </>
        )}

        {/* Search input row */}
        {searchVisible && (
          <>
            <div className="h-px bg-accessory-default" />
            <div className="flex items-center gap-2 px-3">
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearch('')
                    setSearchVisible(false)
                  }
                }}
                className="border-none shadow-none bg-transparent h-auto py-2 text-sm"
                autoFocus
              />
              {search && (
                <>
                  <Button
                    size="icon"
                    variant="neutral-ghost"
                    className="h-6 w-6 shrink-0"
                    onClick={() => {
                      setSearch('')
                      setSearchVisible(false)
                    }}
                    aria-label="Clear search"
                  >
                    <X />
                  </Button>
                  {!hasExactMatch && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleCreateFromSearch(search.trim())}
                      aria-label="Create item"
                    >
                      <Plus />
                      Create
                    </Button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Scrollable item list */}
      <div className="overflow-y-auto">
        <div className="h-px bg-accessory-default" />
        <div className="flex flex-col gap-px">
          {/* In-shelf items: active first, inactive at the bottom */}
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
                onAmountChange={async (delta) => {
                  const updatedItem = { ...item }
                  if (delta > 0) {
                    const purchaseDate = new Date()
                    addItem(
                      updatedItem,
                      updatedItem.consumeAmount,
                      purchaseDate,
                    )
                    await updateItem.mutateAsync({
                      id: item.id,
                      updates: {
                        packedQuantity: updatedItem.packedQuantity,
                        unpackedQuantity: updatedItem.unpackedQuantity,
                        ...(updatedItem.dueDate
                          ? { dueDate: updatedItem.dueDate }
                          : {}),
                      },
                    })
                  } else {
                    consumeItem(updatedItem, updatedItem.consumeAmount)
                    await updateItem.mutateAsync({
                      id: item.id,
                      updates: {
                        packedQuantity: updatedItem.packedQuantity,
                        unpackedQuantity: updatedItem.unpackedQuantity,
                      },
                    })
                  }
                }}
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

          {/* Items not in this shelf — shown when searching */}
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
                    >
                      <ArrowUpFromLine />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
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
    </div>
  )
}

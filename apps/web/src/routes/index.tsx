import {
  createFileRoute,
  Link,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemListToolbar } from '@/components/item/ItemListToolbar'
import { PantryControlBar } from '@/components/pantry/PantryControlBar'
import { PantryShelfCard } from '@/components/pantry/PantryShelfCard'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import type { CreateShelfInput } from '@/components/shelf/AddShelfDialog'
import { AddShelfDialog } from '@/components/shelf/AddShelfDialog'
import { Button } from '@/components/ui/button'
import { useCreateItem, useItems, useUpdateItem } from '@/hooks'
import { useItemSortData } from '@/hooks/useItemSortData'
import { useRecipes } from '@/hooks/useRecipes'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useCreateShelfMutation, useShelvesQuery } from '@/hooks/useShelves'
import { useSortFilter } from '@/hooks/useSortFilter'
import { useTags, useTagTypes } from '@/hooks/useTags'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import { useVendors } from '@/hooks/useVendors'
import {
  filterItems,
  filterItemsByRecipes,
  filterItemsByVendors,
} from '@/lib/filterUtils'
import { addItem, consumeItem } from '@/lib/quantityUtils'
import { matchesFilterConfig } from '@/lib/shelfUtils'
import { sortItems } from '@/lib/sortUtils'
import type { Item, Recipe, Shelf, Vendor } from '@/types'

export const Route = createFileRoute('/')({
  component: PantryView,
  validateSearch: (search: Record<string, unknown>) => ({
    expanded: typeof search.expanded === 'string' ? search.expanded : '',
  }),
})

function PantryView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { expanded } = Route.useSearch()

  const { data: items = [], isLoading } = useItems()
  const { data: tags = [], isLoading: isTagsLoading } = useTags()
  const { data: tagTypes = [], isLoading: isTagTypesLoading } = useTagTypes()
  const { data: vendors = [], isLoading: isVendorsLoading } = useVendors()
  const { data: recipes = [], isLoading: isRecipesLoading } = useRecipes()
  const { data: shelves = [], isLoading: isShelvesLoading } = useShelvesQuery()

  const updateItem = useUpdateItem()
  const createItem = useCreateItem()
  const createShelf = useCreateShelfMutation()

  const [addShelfOpen, setAddShelfOpen] = useState(false)

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
  const allDataLoaded =
    !isLoading &&
    !isTagsLoading &&
    !isTagTypesLoading &&
    !isVendorsLoading &&
    !isRecipesLoading &&
    !isShelvesLoading

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

  const handleCreateFromSearch = async (query: string) => {
    try {
      await createItem.mutateAsync({
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
    } catch {
      // input stays populated for retry
    }
  }

  // Handle tag click - toggle tag in filter
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

  const handleVendorClick = (vendorId: string) => toggleVendorId(vendorId)
  const handleRecipeClick = (recipeId: string) => toggleRecipeId(recipeId)

  const activeTagIds = useMemo(
    () => Object.values(filterState).flat(),
    [filterState],
  )

  // ── Filter pipeline (two-branch) ──────────────────────────────────────────

  // Branch A: search only (no filters)
  const searchedItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )
  const hasExactMatch = searchedItems.some(
    (item) => item.name.toLowerCase() === search.trim().toLowerCase(),
  )

  // Branch B: all filters, no search
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

  // Apply sort (trim guards whitespace-only input)
  const sortedItems = sortItems(
    search.trim() ? searchedItems : filteredItems,
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    allPurchaseDates ?? new Map(),
    sortBy,
    sortDirection,
  )

  // ── Expand/collapse via URL param ──────────────────────────────────────────

  const expandedShelfIds = useMemo(
    () => new Set(expanded ? expanded.split(',') : []),
    [expanded],
  )

  function handleToggleExpand(shelfId: string) {
    const next = new Set(expandedShelfIds)
    if (next.has(shelfId)) next.delete(shelfId)
    else next.add(shelfId)
    navigate({
      to: '/',
      search: (prev) => ({ ...prev, expanded: [...next].join(',') }),
      replace: true,
    })
  }

  // ── Compute shelf item assignments ────────────────────────────────────────

  // Sorted user-defined shelves
  const sortedShelves = useMemo(
    () => [...shelves].sort((a, b) => a.order - b.order),
    [shelves],
  )

  // Unsorted system shelf (always last) — memoized to keep stable identity
  const unsortedShelf = useMemo<Shelf>(
    () => ({
      id: 'unsorted',
      name: 'Unsorted',
      type: 'system',
      order: Number.MAX_SAFE_INTEGER,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }),
    [],
  )

  // IDs claimed by selection shelves
  const selectionShelfItemIds = useMemo(() => {
    const set = new Set<string>()
    for (const shelf of shelves) {
      if (shelf.type === 'selection') {
        for (const id of shelf.itemIds ?? []) set.add(id)
      }
    }
    return set
  }, [shelves])

  // IDs matched by filter shelves
  const filterMatchedItemIds = useMemo(() => {
    const set = new Set<string>()
    for (const shelf of shelves) {
      if (shelf.type === 'filter' && shelf.filterConfig) {
        for (const item of items) {
          if (matchesFilterConfig(item, shelf.filterConfig, recipes, tags)) {
            set.add(item.id)
          }
        }
      }
    }
    return set
  }, [shelves, items, recipes, tags])

  /**
   * Returns the base (un-search-filtered) items that belong to a shelf.
   * This is used for shelf item counts and auto-expand logic.
   */
  const getBaseItemsForShelf = useMemo(() => {
    return (shelf: Shelf): Item[] => {
      if (shelf.id === 'unsorted') {
        return items.filter(
          (item) =>
            !selectionShelfItemIds.has(item.id) &&
            !filterMatchedItemIds.has(item.id),
        )
      }
      if (shelf.type === 'filter') {
        if (!shelf.filterConfig) return []
        const { filterConfig } = shelf
        return items.filter((item) =>
          matchesFilterConfig(item, filterConfig, recipes, tags),
        )
      }
      // Selection shelf
      const itemMap = new Map(items.map((i) => [i.id, i]))
      return (shelf.itemIds ?? []).flatMap((id) => {
        const item = itemMap.get(id)
        return item ? [item] : []
      })
    }
  }, [items, selectionShelfItemIds, filterMatchedItemIds, recipes, tags])

  /**
   * Returns sorted+filtered items for display inside a shelf card.
   * Applies the active search/filter on top of shelf membership.
   */
  const getDisplayItemsForShelf = useMemo(() => {
    const lowerSearch = search.toLowerCase()
    return (shelf: Shelf): Item[] => {
      const baseItems = getBaseItemsForShelf(shelf)

      // Apply search or filter to narrow the base set
      let narrowed: Item[]
      if (search.trim()) {
        narrowed = baseItems.filter((item) =>
          item.name.toLowerCase().includes(lowerSearch),
        )
      } else if (
        Object.keys(filterState).length > 0 ||
        selectedVendorIds.length > 0 ||
        selectedRecipeIds.length > 0
      ) {
        const tagFiltered = filterItems(baseItems, filterState, tags)
        const vendorFiltered = filterItemsByVendors(
          tagFiltered,
          selectedVendorIds,
        )
        narrowed = filterItemsByRecipes(
          vendorFiltered,
          selectedRecipeIds,
          recipes,
        )
      } else {
        narrowed = baseItems
      }

      return sortItems(
        narrowed,
        allQuantities ?? new Map(),
        allExpiryDates ?? new Map(),
        allPurchaseDates ?? new Map(),
        sortBy,
        sortDirection,
      )
    }
  }, [
    search,
    filterState,
    selectedVendorIds,
    selectedRecipeIds,
    getBaseItemsForShelf,
    tags,
    recipes,
    allQuantities,
    allExpiryDates,
    allPurchaseDates,
    sortBy,
    sortDirection,
  ])

  // ── Auto-expand shelves when search/filter is active ──────────────────────

  const isFiltering =
    !!search.trim() ||
    Object.keys(filterState).length > 0 ||
    selectedVendorIds.length > 0 ||
    selectedRecipeIds.length > 0

  // Use a ref to read expandedShelfIds inside the effect without making it a dep
  // (including it would cause infinite loops since the effect also updates it).
  const expandedShelfIdsRef = useRef(expandedShelfIds)
  useEffect(() => {
    expandedShelfIdsRef.current = expandedShelfIds
  })

  useEffect(() => {
    if (!isFiltering) return
    const allShelves = [...sortedShelves, unsortedShelf]
    const shelvesWithMatches = allShelves.filter(
      (shelf) => getDisplayItemsForShelf(shelf).length > 0,
    )
    if (shelvesWithMatches.length === 0) return
    const currentExpanded = expandedShelfIdsRef.current
    const next = new Set([
      ...currentExpanded,
      ...shelvesWithMatches.map((s) => s.id),
    ])
    if (next.size !== currentExpanded.size) {
      navigate({
        to: '/',
        search: (prev) => ({ ...prev, expanded: [...next].join(',') }),
        replace: true,
      })
    }
  }, [
    isFiltering,
    sortedShelves,
    unsortedShelf,
    getDisplayItemsForShelf,
    navigate,
  ])

  // ── Expand All / Collapse All ─────────────────────────────────────────────

  const allShelfIds = useMemo(
    () => [...sortedShelves.map((s) => s.id), 'unsorted'],
    [sortedShelves],
  )

  function handleExpandAll() {
    navigate({
      to: '/',
      search: (prev) => ({ ...prev, expanded: allShelfIds.join(',') }),
      replace: true,
    })
  }

  function handleCollapseAll() {
    navigate({
      to: '/',
      search: (prev) => ({ ...prev, expanded: '' }),
      replace: true,
    })
  }

  // ── Item amount handlers ───────────────────────────────────────────────────

  const handleAmountChange = async (item: Item, delta: number) => {
    const updatedItem = { ...item }
    if (delta > 0) {
      const purchaseDate = new Date()
      addItem(updatedItem, updatedItem.consumeAmount, purchaseDate)
      await updateItem.mutateAsync({
        id: item.id,
        updates: {
          packedQuantity: updatedItem.packedQuantity,
          unpackedQuantity: updatedItem.unpackedQuantity,
          ...(updatedItem.dueDate ? { dueDate: updatedItem.dueDate } : {}),
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
  }

  // ── Add Shelf ──────────────────────────────────────────────────────────────

  const handleAddShelf = (data: CreateShelfInput) => {
    createShelf.mutate({
      name: data.name,
      type: data.type,
      order:
        (shelves.length > 0 ? Math.max(...shelves.map((s) => s.order)) : 0) + 1,
      ...(data.filterConfig ? { filterConfig: data.filterConfig } : {}),
    })
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading || isShelvesLoading) {
    return <LoadingSpinner />
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="sticky top-0 z-10 bg-background-surface">
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
        >
          <Button
            size="icon"
            variant="neutral-ghost"
            className="lg:w-auto lg:px-3"
            aria-label="Add shelf"
            onClick={() => setAddShelfOpen(true)}
          >
            <Plus />
            <span className="hidden lg:inline">Add shelf</span>
          </Button>
          <Link to="/items/new">
            <Button
              size="icon"
              className="lg:w-auto lg:px-3"
              aria-label="Add item"
            >
              <Plus />
              <span className="hidden lg:inline">Add</span>
            </Button>
          </Link>
        </ItemListToolbar>
        <div className="h-px bg-accessory-default" />

        <PantryControlBar
          allShelfIds={allShelfIds}
          expandedIds={expandedShelfIds}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
        />
        <div className="h-px bg-accessory-default" />
      </div>

      <div>
        {items.length === 0 ? (
          <div className="text-center py-16 text-foreground-muted flex flex-col items-center gap-6">
            <div>
              <p>{t('pantry.empty.title')}</p>
              <p className="text-sm mt-1">{t('pantry.empty.description')}</p>
            </div>
            <Button asChild size="lg" className="px-8">
              <Link to="/items/new">
                <Plus />
                {t('pantry.empty.createButton')}
              </Link>
            </Button>
          </div>
        ) : sortedItems.length === 0 && isFiltering ? (
          <div className="text-center py-12 text-foreground-muted">
            <p>No items match the current filters.</p>
            <p className="text-sm mt-1">
              Try adjusting or clearing your filters.
            </p>
          </div>
        ) : (
          <div className="bg-background-base flex flex-col gap-px pb-4 px-3 pt-3">
            {sortedShelves.map((shelf) => {
              const displayItems = getDisplayItemsForShelf(shelf)
              const isExpanded = expandedShelfIds.has(shelf.id)
              return (
                <PantryShelfCard
                  key={shelf.id}
                  shelf={shelf}
                  items={displayItems}
                  isExpanded={isExpanded}
                  onToggle={() => handleToggleExpand(shelf.id)}
                  search={search}
                  tags={tags}
                  tagTypes={tagTypes}
                  isTagsVisible={isTagsVisible}
                  vendorMap={vendorMap}
                  recipeMap={recipeMap}
                  selectedVendorIds={selectedVendorIds}
                  selectedRecipeIds={selectedRecipeIds}
                  activeTagIds={activeTagIds}
                  onAmountChange={handleAmountChange}
                  onTagClick={handleTagClick}
                  onVendorClick={handleVendorClick}
                  onRecipeClick={handleRecipeClick}
                />
              )
            })}
            {/* Unsorted shelf — always last */}
            {(() => {
              const displayItems = getDisplayItemsForShelf(unsortedShelf)
              const isExpanded = expandedShelfIds.has('unsorted')
              return (
                <PantryShelfCard
                  key="unsorted"
                  shelf={unsortedShelf}
                  items={displayItems}
                  isExpanded={isExpanded}
                  onToggle={() => handleToggleExpand('unsorted')}
                  search={search}
                  tags={tags}
                  tagTypes={tagTypes}
                  isTagsVisible={isTagsVisible}
                  vendorMap={vendorMap}
                  recipeMap={recipeMap}
                  selectedVendorIds={selectedVendorIds}
                  selectedRecipeIds={selectedRecipeIds}
                  activeTagIds={activeTagIds}
                  onAmountChange={handleAmountChange}
                  onTagClick={handleTagClick}
                  onVendorClick={handleVendorClick}
                  onRecipeClick={handleRecipeClick}
                />
              )
            })()}
          </div>
        )}
      </div>

      <AddShelfDialog
        open={addShelfOpen}
        onOpenChange={setAddShelfOpen}
        onSubmit={handleAddShelf}
      />
    </div>
  )
}

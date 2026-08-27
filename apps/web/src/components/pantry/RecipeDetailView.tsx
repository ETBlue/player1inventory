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
import { useStockedItems, useUpdateItem } from '@/hooks'
import { useItemSearchTailWiring } from '@/hooks/useItemSearchTailWiring'
import { useItemSortData } from '@/hooks/useItemSortData'
import { useRecipes, useUpdateRecipe } from '@/hooks/useRecipes'
import { useShowStock } from '@/hooks/useShowStock'
import { useSortFilter } from '@/hooks/useSortFilter'
import { useTags, useTagTypes } from '@/hooks/useTags'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import { useVendors } from '@/hooks/useVendors'
import { isInactive } from '@/lib/quantityUtils'
import { type SortDirection, type SortField, sortItems } from '@/lib/sortUtils'
import type { PantryItem, StockFields } from '@/types'

interface RecipeDetailViewProps {
  recipeId: string
}

export function RecipeDetailView({ recipeId }: RecipeDetailViewProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isUnsorted = recipeId === 'unsorted'

  const { data: allItems = [], isLoading: isItemsLoading } = useStockedItems()
  const { data: recipes = [], isLoading: isRecipesLoading } = useRecipes()
  const { data: vendors = [] } = useVendors()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()

  const updateItem = useUpdateItem()
  const updateRecipe = useUpdateRecipe()
  const showStock = useShowStock()

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

  // Sourced from `inScopeItems`, the PRE-search location-scoped list, because
  // that is what `inGroupIds` is DEFINED to be — `hooks/CLAUDE.md` on
  // `useItemSearchTail`: "must be the page's own already-location-scoped
  // list". Reading it off a post-search value is wrong by contract, whether or
  // not a test can observe the difference. As on `VendorDetailView`, swapping
  // in `displayedItems` is an EQUIVALENT MUTANT today: this page's only
  // narrowing of `inScopeItems` is the same name match the tail already
  // applies, so the two sets agree on every id the tail can ask about. That
  // is an accident of the current derivation, not a licence.
  const inGroupIds = useMemo(
    () => new Set(inScopeItems.map((i) => i.id)),
    [inScopeItems],
  )

  // Keyed by walking the global `recipes` list rather than
  // `allItems`, so it resolves bucket-3 rows (not stocked here, hence
  // absent from `allItems`) just as well as list rows. Both renderers below
  // read it, so a tail row carries exactly the recipe badges its list-row
  // counterpart would. Vendor badges must still be computed per row from the
  // full `vendors` list, for the same reason `vendorMap` (keyed over
  // `allItems`) cannot serve tail rows.
  const recipeMap = new Map<string, typeof recipes>()
  for (const r of recipes) {
    for (const ri of r.items) {
      const existing = recipeMap.get(ri.itemId) ?? []
      recipeMap.set(ri.itemId, [...existing, r])
    }
  }

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

  // Bucket 2's action on a real recipe page. Membership lives on the RECIPE
  // (`Recipe.items: RecipeItem[]`), not on the item, so this appends a
  // `RecipeItem` and writes the whole array back — the shape
  // `settings/recipes/$id/items.tsx` already uses. The dedup check is
  // LOAD-BEARING, and more so here than on any sibling view: it fires during
  // the `useItems` / `useStockedItems` refetch skew, when an item already in
  // this recipe briefly renders in bucket 2 with a live button. `inGroupIds`
  // is derived from `useStockedItems()` (query key `['items', 'stocked',
  // {locationId}]`) while the tail's buckets come from `useItems()`
  // (`['items', {locationId}]`) — two separate cache entries that a mutation
  // invalidates together but which refetch INDEPENDENTLY, so the tail can see
  // the item as stocked-here (bucket 2) while the stale `inGroupIds` still
  // omits it (action still offered). Pressing it again without this guard
  // appends a SECOND `RecipeItem` with the same `itemId`, which cooking then
  // double-counts as an ingredient. Do not "clean it up".
  async function handleAddToRecipe(item: PantryItem) {
    if (isUnsorted || !recipe) return
    if (recipe.items.some((ri) => ri.itemId === item.id)) return
    await updateRecipe.mutateAsync({
      id: recipe.id,
      updates: {
        items: [
          ...recipe.items,
          // `|| 1`, NOT `?? 1`: an item may legitimately carry consumeAmount 0
          // (explicitly set, imported, or created while 0 was the default),
          // and `defaultAmount: 0` means "optional, unchecked" in cooking — so
          // `?? 1` would add an ingredient that silently does nothing. Same
          // reasoning, same operator, as `settings/recipes/$id/items.tsx`.
          { itemId: item.id, defaultAmount: item.consumeAmount || 1 },
        ],
      },
    })
  }

  // The "Not added to recipe" page's bucket 2 is inert but never silent: its
  // group is "items in NO recipe", so an action there would have to REMOVE the
  // item from every recipe — destructive, the opposite of every other bucket-2
  // action. Each row names the recipes already holding it instead. Recipe
  // names ARE subject to the app's title-case convention (only vendor and
  // location names are excluded), so this `capitalize` is the mirror image of
  // `VendorDetailView`'s `normal-case`.
  const renderRecipesNote = (item: PantryItem) => (
    <span className="capitalize">
      {t('items.searchTail.inRecipes', {
        recipes: (recipeMap.get(item.id) ?? []).map((r) => r.name).join(', '),
      })}
    </span>
  )

  // `sortTail` hands both tail sections the page's own sort. Bucket-3 rows
  // carry no entry in the sort maps, which `sortItems` handles explicitly —
  // same accepted residual, and same reasoning, as `ShelfDetailView`.
  //
  // `query` is the RAW search value: `useItemSearchTail` trims internally.
  //
  // The unresolved-recipe window gets NEITHER descriptor: when no recipe in
  // `useRecipes()` carries `recipeId` — it was deleted, or the id never
  // existed at all (a stale bookmark, a hand-typed `?id=`), since
  // `validateSearch` in `routes/index.tsx` passes `id` through as an
  // arbitrary string with no existence check — there would be no
  // `recipe.items` to append to, so bucket 2 is simply absent for that
  // render. A still-loading `useRecipes()` is NOT one of those cases: the
  // `<LoadingSpinner />` below returns before any tail is rendered.
  const { tailProps, hasTail } = useItemSearchTailWiring({
    inGroupIds,
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
    ...(!isUnsorted && recipe
      ? {
          groupAction: {
            label: t('items.searchTail.addToRecipe'),
            onAction: handleAddToRecipe,
            icon: <ArrowUpFromLine />,
          },
        }
      : {}),
    ...(isUnsorted ? { groupNote: renderRecipesNote } : {}),
  })

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
              {/* Leftmost, ahead of the back button — the placement every
                  other toolbar uses (shopping, cooking, pantry group views). */}
              <LocationSwitcher className="lg:hidden" />
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
            <ListSectionDivider>
              {t('shopping.inactiveItems', { count: inactiveDisplayed.length })}
            </ListSectionDivider>
          )}
          {inactiveDisplayed.map(renderItemCard)}

          {trimmedSearch && <ItemSearchTail {...tailProps} />}

          {!hasTail && sortedItems.length === 0 && (
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
